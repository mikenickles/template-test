package dev.orbit.app.ui.components

import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.ui.SharedKeys
import dev.orbit.app.ui.shared
import dev.orbit.app.ui.theme.LocalReducedMotion
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.pressScale
import dev.orbit.app.ui.theme.rememberHaptics
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

/*
 * The crew, tucked into one button on Home. Tapping it sends every character jumping out of the button and
 * landing in a lineup over a frosted Home, where any of them can be opened; Done sends them hopping back in.
 * With system animations off they simply fade in and out.
 */

private const val FLIGHT = 640f
private const val BACK_FLIGHT = 460f

/** When each one jumps, lands and goes home, in ms from the tap. Bigger crews leave closer together. */
private class Timeline(val count: Int, val reduced: Boolean) {
    private val stagger = if (count <= 1) 0f else minOf(80f, 560f / (count - 1))
    private val backStagger = if (count <= 1) 0f else minOf(60f, 380f / (count - 1))
    fun launch(i: Int) = 140f + i * stagger
    fun back(i: Int) = (count - 1 - i) * backStagger
    val openEnd = if (reduced) 320f else launch(count - 1) + FLIGHT + 700f
    val closeEnd = if (reduced) 240f else back(0) + BACK_FLIGHT + 260f
}

/** Whether the crew is out, and where the button is that they come from. Survives a trip to an agent's page. */
@Stable
class CrewHuddle internal constructor(startOpen: Boolean) {
    var open by mutableStateOf(startOpen)
        private set
    internal var closing by mutableStateOf(false)
    internal var origin by mutableStateOf(Offset.Zero)

    /** Ms into the opening (or, while [closing], the closing). A lineup that was already out starts settled. */
    internal val clock = Animatable(if (startOpen) Float.MAX_VALUE else 0f)

    fun show() {
        if (!open) open = true
    }

    fun hide() {
        if (open) open = false
    }

    internal val visible get() = open || closing

    companion object {
        val Saver = Saver<CrewHuddle, Boolean>({ it.open }, { CrewHuddle(it) })
    }
}

@Composable
fun rememberCrewHuddle(open: Boolean = false): CrewHuddle = rememberSaveable(saver = CrewHuddle.Saver) { CrewHuddle(open) }

private fun seg(t: Float, a: Float, b: Float) = ((t - a) / (b - a)).coerceIn(0f, 1f)
private fun lerp(a: Float, b: Float, p: Float) = a + (b - a) * p
private fun outCubic(p: Float) = 1f - (1f - p).pow(3)
private fun inOut(p: Float) = if (p < 0.5f) 4f * p * p * p else 1f - (-2f * p + 2f).pow(3) / 2f
private fun spring(p: Float) = if (p <= 0f) 0f else 1f - exp(-5.5f * p) * cos(2f * PI.toFloat() * p)
private fun arc(p: Float) = sin(PI.toFloat() * p)

/** How far Home behind the lineup is frosted over, 0 to 1. */
private fun CrewHuddle.frost(timeline: Timeline): Float {
    val t = clock.value
    return when {
        closing -> 1f - outCubic(seg(t, timeline.closeEnd - 380f, timeline.closeEnd))
        open -> outCubic(seg(t, 0f, 280f))
        else -> 0f
    }
}

/** Blurs whatever sits behind the lineup while it's out (Android 12 and up; older phones just get the frost). */
fun Modifier.behindCrewHuddle(huddle: CrewHuddle, crewSize: Int): Modifier = graphicsLayer {
    if (!huddle.visible || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@graphicsLayer
    val f = huddle.frost(Timeline(crewSize, false))
    val r = 16.dp.toPx() * f
    renderEffect = if (r > 0.5f) BlurEffect(r, r, TileMode.Decal) else null
}

/**
 * The button: three of the crew peeking out of a round nest, taking turns to hop (a random one each time,
 * never the same twice running), with how many there are on its corner.
 */
@Composable
fun CrewButton(agents: List<Agent>, huddle: CrewHuddle, modifier: Modifier = Modifier) {
    val c = Orbit.colors
    val reduced = LocalReducedMotion.current
    val haptics = rememberHaptics()
    val timeline = remember(agents.size, reduced) { Timeline(agents.size, reduced) }
    val interaction = remember { MutableInteractionSource() }

    var hopFace by remember { mutableIntStateOf(-1) }
    var hopHeight by remember { mutableFloatStateOf(0f) }
    val hop = remember { Animatable(0f) }
    val faces = agents.take(3)
    LaunchedEffect(reduced, huddle.visible, faces.size) {
        if (reduced || huddle.visible || faces.isEmpty()) {
            hopFace = -1
            return@LaunchedEffect
        }
        // Random-looking, but the same sequence each time, so screenshots stay steady.
        val random = Random(faces.joinToString { it.id }.hashCode())
        while (true) {
            var next = random.nextInt(faces.size)
            if (faces.size > 1 && next == hopFace) next = (next + 1 + random.nextInt(faces.size - 1)) % faces.size
            hopFace = next
            hopHeight = 5f + random.nextFloat() * 6f
            hop.snapTo(0f)
            hop.animateTo(1f, tween(450, easing = LinearEasing))
        }
    }

    Box(modifier) {
        Surface(
            onClick = {
                haptics.tick()
                huddle.show()
            },
            modifier = Modifier
                .lift(CircleShape, 0.6f)
                .pressScale(interaction, 0.9f)
                .graphicsLayer {
                    // A small bounce as the last of them gets home.
                    if (huddle.closing && !reduced) {
                        val b = arc(seg(huddle.clock.value, timeline.closeEnd - 280f, timeline.closeEnd))
                        scaleX = 1f + 0.12f * b
                        scaleY = 1f + 0.12f * b
                    }
                }
                .onGloballyPositioned { huddle.origin = it.boundsInRoot().center }
                .semantics { contentDescription = "Your crew, ${agents.size} ${if (agents.size == 1) "agent" else "agents"}" },
            shape = CircleShape,
            color = c.surface,
            border = surfaceBorder(),
            interactionSource = interaction,
        ) {
            Box(Modifier.size(width = 52.dp, height = 42.dp).clip(CircleShape)) {
                // Drawn left, right, then the middle one in front.
                for (i in listOf(0, 2, 1)) {
                    val agent = faces.getOrNull(i) ?: continue
                    AgentAvatar(
                        agent.avatar,
                        Modifier
                            .align(Alignment.BottomStart)
                            .offset(x = listOf((-2).dp, 11.dp, 24.dp)[i], y = 7.dp)
                            .graphicsLayer {
                                val lift = if (i == hopFace) arc(hop.value) * hopHeight.dp.toPx() else 0f
                                // They leave as the crew jumps out, and come back as the crew gets home.
                                val t = huddle.clock.value
                                val away = when {
                                    huddle.closing -> 1f - seg(t, timeline.closeEnd - 300f, timeline.closeEnd - 120f)
                                    huddle.open -> seg(t, 60f, timeline.launch(minOf(2, faces.size - 1)))
                                    else -> 0f
                                }
                                translationY = -lift + away * 30.dp.toPx()
                                alpha = 1f - away
                            },
                        size = 30.dp,
                    )
                }
            }
        }
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .offset(x = 6.dp, y = (-6).dp)
                .size(22.dp)
                .clip(CircleShape)
                .background(c.bg)
                .padding(2.dp)
                .clip(CircleShape)
                .background(c.primary),
            contentAlignment = Alignment.Center,
        ) {
            Text("${agents.size}", style = OrbitType.caption.copy(fontWeight = FontWeight.SemiBold), color = c.onPrimary, maxLines = 1)
        }
    }
}

/**
 * The lineup, over the whole screen while the crew is out: everyone in rows of three with their name and role,
 * and New agent below. Tapping someone opens their page.
 */
@Composable
fun CrewHuddleOverlay(
    agents: List<Agent>,
    huddle: CrewHuddle,
    onOpen: (Agent) -> Unit,
    onNewAgent: () -> Unit,
) {
    val c = Orbit.colors
    val reduced = LocalReducedMotion.current
    val haptics = rememberHaptics()
    val timeline = remember(agents.size, reduced) { Timeline(agents.size, reduced) }

    LaunchedEffect(huddle.open) {
        if (huddle.open) {
            huddle.closing = false
            // Back from an agent's page: the lineup is already out.
            if (huddle.clock.value >= timeline.openEnd) {
                huddle.clock.snapTo(timeline.openEnd)
                return@LaunchedEffect
            }
            huddle.clock.snapTo(0f)
            huddle.clock.animateTo(timeline.openEnd, tween(timeline.openEnd.toInt(), easing = LinearEasing))
        } else if (huddle.clock.value > 0f) {
            huddle.closing = true
            huddle.clock.snapTo(0f)
            huddle.clock.animateTo(timeline.closeEnd, tween(timeline.closeEnd.toInt(), easing = LinearEasing))
            huddle.closing = false
            huddle.clock.snapTo(0f)
        }
    }
    if (!huddle.visible || agents.isEmpty()) return

    BackHandler(huddle.open) {
        haptics.tick()
        huddle.hide()
    }
    // Idle life once everyone is home: a slow breath each, out of step with each other.
    var idle by remember { mutableLongStateOf(0L) }
    LaunchedEffect(huddle.open, reduced) {
        if (!huddle.open || reduced) return@LaunchedEffect
        while (true) withFrameMillis { idle = it }
    }

    val headIn = {
        val t = huddle.clock.value
        when {
            huddle.closing -> 1f - inOut(seg(t, 0f, 220f))
            reduced -> seg(t, 0f, 240f)
            else -> spring(seg(t, 220f, 760f))
        }
    }

    Box(Modifier.fillMaxSize()) {
        // The frost, which also keeps Home's controls out of reach while the crew is out.
        Box(
            Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = huddle.frost(timeline) }
                .background(c.bg.copy(alpha = 0.8f))
                .pointerInput(Unit) { detectTapGestures { } },
        )
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = OrbitDimens.gutter),
        ) {
            Row(
                Modifier
                    .padding(top = 62.dp)
                    .graphicsLayer {
                        val h = headIn()
                        alpha = h.coerceIn(0f, 1f)
                        translationY = (1f - h) * -16.dp.toPx()
                    },
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("Your crew", style = OrbitType.display, color = c.text)
                        Text("${agents.size}", Modifier.padding(start = 8.dp), style = OrbitType.display.copy(fontWeight = FontWeight.Medium), color = c.textTertiary)
                    }
                    Text("Tap anyone to edit them.", Modifier.padding(top = 4.dp), style = OrbitType.bodyM, color = c.textSecondary)
                }
                Pill("Done", {
                    haptics.tick()
                    huddle.hide()
                }, Modifier.padding(top = 2.dp), selected = true)
            }
            Spacer(Modifier.height(24.dp))
            agents.chunked(3).forEachIndexed { row, members ->
                Row(Modifier.fillMaxWidth().padding(top = if (row == 0) 0.dp else 8.dp)) {
                    members.forEachIndexed { col, agent ->
                        CrewSlot(agent, row * 3 + col, col, huddle, timeline, { idle }, Modifier.weight(1f)) { onOpen(agent) }
                    }
                    repeat(3 - members.size) { Spacer(Modifier.weight(1f)) }
                }
            }
            NewAgentSlot(
                Modifier.padding(top = 22.dp, bottom = 32.dp).graphicsLayer {
                    val t = huddle.clock.value
                    val a = when {
                        huddle.closing -> 1f - inOut(seg(t, 0f, 200f))
                        reduced -> seg(t, 0f, 240f)
                        else -> spring(seg(t, timeline.launch(agents.size - 1) + FLIGHT - 100f, timeline.launch(agents.size - 1) + FLIGHT + 500f))
                    }
                    alpha = (a * 1.5f).coerceIn(0f, 1f)
                    translationY = (1f - a) * 24.dp.toPx()
                    scaleX = lerp(0.94f, 1f, a)
                    scaleY = scaleX
                },
                onNewAgent,
            )
        }
    }
}

private val SlotSize = 100.dp

/** One of the crew in the lineup: it flies from the button to here, lands with a squash, and breathes. */
@Composable
private fun CrewSlot(
    agent: Agent,
    index: Int,
    col: Int,
    huddle: CrewHuddle,
    timeline: Timeline,
    idle: () -> Long,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val c = Orbit.colors
    val tint = agent.avatar.tint()
    var center by remember { mutableStateOf(Offset.Zero) }
    val interaction = remember { MutableInteractionSource() }
    // How settled into its spot it is: the glow, shadow and name come with it.
    val land = {
        val t = huddle.clock.value
        val a = timeline.launch(index)
        when {
            huddle.closing -> if (timeline.reduced) 1f - seg(t, 0f, 200f) else 1f - seg(t, timeline.back(index) - 60f, timeline.back(index) + 120f)
            timeline.reduced -> seg(t, index * 40f, index * 40f + 220f)
            else -> seg(t, a + FLIGHT - 160f, a + FLIGHT + 140f)
        }
    }
    Column(
        modifier
            .pressScale(interaction, 0.95f)
            .clickable(interaction, indication = null, onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = "Edit ${agent.name}"
            }
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(SlotSize).onGloballyPositioned { center = it.boundsInRoot().center }) {
            Box(
                Modifier
                    .size(SlotSize + 4.dp)
                    .align(Alignment.Center)
                    .graphicsLayer { alpha = land() * 0.7f }
                    .background(Brush.radialGradient(listOf(tint.copy(alpha = 0.34f), Color.Transparent))),
            )
            Canvas(
                Modifier
                    .align(Alignment.BottomCenter)
                    .offset(y = 2.dp)
                    .size(width = 74.dp, height = 14.dp)
                    .graphicsLayer {
                        val l = land()
                        alpha = l
                        scaleX = lerp(0.4f, 1f, l)
                        scaleY = scaleX
                    },
            ) {
                drawOval(Brush.radialGradient(listOf(Color.Black.copy(alpha = if (c.isDark) 0.4f else 0.2f), Color.Transparent), radius = size.width / 2f))
            }
            Box(
                Modifier
                    .size(SlotSize)
                    .graphicsLayer {
                        val t = huddle.clock.value
                        val dx = huddle.origin.x - center.x
                        val dy = huddle.origin.y - center.y
                        val side = if (index % 2 == 0) 1f else -1f
                        var x = 0f
                        var y = 0f
                        var s = 1f
                        var sx = 1f
                        var sy = 1f
                        var rot = 0f
                        var a = 1f
                        transformOrigin = TransformOrigin(0.5f, 0.92f)
                        if (timeline.reduced) {
                            a = land()
                        } else if (huddle.closing) {
                            val start = timeline.back(index)
                            val p = seg(t, start, start + BACK_FLIGHT)
                            val e = inOut(p)
                            val crouch = arc(seg(t, start - 120f, start))
                            sy = 1f - 0.12f * crouch
                            sx = 1f + 0.08f * crouch
                            x = dx * e
                            y = dy * e - arc(p) * (huddle.origin.y - 90.dp.toPx()).coerceIn(40.dp.toPx(), 120.dp.toPx())
                            s = lerp(1f, 0.24f, e)
                            rot = arc(p) * -18f * side
                            a = 1f - seg(p, 0.8f, 1f)
                        } else {
                            val start = timeline.launch(index)
                            val p = seg(t, start, start + FLIGHT)
                            val e = inOut(p)
                            if (t < start) a = 0f
                            x = dx * (1f - e) + arc(p) * (col - 1) * 26.dp.toPx()
                            y = dy * (1f - e) - arc(p) * (huddle.origin.y - 90.dp.toPx() + col * 14.dp.toPx()).coerceIn(40.dp.toPx(), 170.dp.toPx())
                            s = lerp(0.26f, 1f, outCubic(p))
                            rot = arc(p) * 22f * side + (1f - p) * (1f - p) * -40f * side
                            // Touchdown: a squash, then a settle.
                            val q = seg(t, start + FLIGHT, start + FLIGHT + 520f)
                            val k = if (q > 0f) exp(-5f * q) * cos(2.6f * PI.toFloat() * q) else 0f
                            sy = 1f - 0.17f * k
                            sx = 1f + 0.12f * k
                            if (huddle.open && t >= timeline.openEnd) {
                                val now = idle() / 1000f
                                sy *= 1f + 0.018f * sin(now * 2.1f + index * 1.3f)
                                y += sin(now * 1.6f + index) * 1.5f.dp.toPx()
                            }
                        }
                        translationX = x
                        translationY = y
                        scaleX = s * sx
                        scaleY = s * sy
                        rotationZ = rot
                        alpha = a
                    },
            ) {
                AgentAvatar(agent.avatar, Modifier.shared(SharedKeys.agentAvatar(agent.id)), size = SlotSize)
            }
        }
        Column(
            Modifier.padding(top = 8.dp).graphicsLayer {
                val l = land()
                alpha = l
                translationY = (1f - l) * 8.dp.toPx()
            },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(agent.name, style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
            if (agent.role.isNotBlank()) {
                Text(agent.role, style = OrbitType.caption, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
            }
        }
    }
}

/** A dashed place for one more. */
@Composable
private fun NewAgentSlot(modifier: Modifier, onClick: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusL)
    val edge = c.line
    Row(
        modifier
            .fillMaxWidth()
            .height(60.dp)
            .drawBehind {
                drawRoundRect(
                    edge,
                    cornerRadius = CornerRadius(OrbitDimens.radiusL.toPx()),
                    style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))),
                )
            }
            .tap(shape, 0.97f, onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OrbitIcon(OrbitIcon.Plus, size = 18.dp, tint = c.textSecondary)
        Text("New agent", Modifier.padding(start = 10.dp), style = OrbitType.titleS, color = c.textSecondary)
    }
}
