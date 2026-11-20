package dev.orbit.app.ui.components

import android.content.Context
import android.graphics.BitmapFactory
import androidx.annotation.DrawableRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.orbit.app.R
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.ui.theme.LocalReducedMotion
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitMotion
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random
import kotlinx.coroutines.delay

/**
 * One of the characters an agent can look like. [fill] is its signature color, used for the
 * agent's name and @mentions on dark pages; [onLight] is a deeper shade that reads on light ones.
 */
class AgentCharacter(val number: Int, val name: String, @DrawableRes val image: Int, val fill: Color, val onLight: Color)

val Characters: List<AgentCharacter> = listOf(
    AgentCharacter(1, "Explorer Bot", R.drawable.avatar_01, Color(0xFFF7843A), Color(0xFFC2410C)),
    AgentCharacter(2, "Leaf Sprout", R.drawable.avatar_02, Color(0xFFA3CB4A), Color(0xFF4D7C0F)),
    AgentCharacter(3, "Red Yeti", R.drawable.avatar_03, Color(0xFFF4643A), Color(0xFFC0341A)),
    AgentCharacter(4, "Teal Fox", R.drawable.avatar_04, Color(0xFF4FB3BC), Color(0xFF0F6E77)),
    AgentCharacter(5, "Mushroom Friend", R.drawable.avatar_05, Color(0xFFF27450), Color(0xFFB83A1B)),
    AgentCharacter(6, "Wise Owl", R.drawable.avatar_06, Color(0xFFC58AE0), Color(0xFF8B3FB8)),
    AgentCharacter(7, "Mechanic Bot", R.drawable.avatar_07, Color(0xFFFFC93C), Color(0xFFA16207)),
    AgentCharacter(8, "Smiling Cloud", R.drawable.avatar_08, Color(0xFFF7B79A), Color(0xFFB4532E)),
    AgentCharacter(9, "White Astronaut", R.drawable.avatar_09, Color(0xFF5AA8E6), Color(0xFF1D63A8)),
    AgentCharacter(10, "Teal Hiker", R.drawable.avatar_10, Color(0xFF4FCBAA), Color(0xFF0F7F68)),
    AgentCharacter(11, "Forest Tree", R.drawable.avatar_11, Color(0xFFD08A50), Color(0xFF8A4B16)),
    AgentCharacter(12, "Water Drop", R.drawable.avatar_12, Color(0xFF52BDEB), Color(0xFF0E7490)),
    AgentCharacter(13, "Mushroom Explorer", R.drawable.avatar_13, Color(0xFFE8A452), Color(0xFF9A5B0B)),
    AgentCharacter(14, "Pink Axolotl", R.drawable.avatar_14, Color(0xFFFF8FAB), Color(0xFFC2335A)),
    AgentCharacter(15, "Penguin Pilot", R.drawable.avatar_15, Color(0xFF94A8DC), Color(0xFF3A5191)),
    AgentCharacter(16, "Purple Wizard", R.drawable.avatar_16, Color(0xFFA684F2), Color(0xFF6D28D9)),
    AgentCharacter(17, "Retro Computer", R.drawable.avatar_17, Color(0xFF5FCB72), Color(0xFF2E7D32)),
    AgentCharacter(18, "Leafy Bush", R.drawable.avatar_18, Color(0xFF86BE47), Color(0xFF4B7A12)),
    AgentCharacter(19, "Music Monster", R.drawable.avatar_19, Color(0xFF8FB0C8), Color(0xFF3F5F7A)),
    AgentCharacter(20, "Happy Sun", R.drawable.avatar_20, Color(0xFFFFB52E), Color(0xFFB45309)),
    AgentCharacter(21, "Ice Crystal", R.drawable.avatar_21, Color(0xFF8FD6F0), Color(0xFF1F7290)),
    AgentCharacter(22, "Raccoon Explorer", R.drawable.avatar_22, Color(0xFFD2A27A), Color(0xFF8A5A2E)),
    AgentCharacter(23, "Purple Alien", R.drawable.avatar_23, Color(0xFFC79BF0), Color(0xFF8240C0)),
    AgentCharacter(24, "Sprout Bot", R.drawable.avatar_24, Color(0xFF72CC55), Color(0xFF3F7F1F)),
    AgentCharacter(25, "Blue Yeti", R.drawable.avatar_25, Color(0xFF74BCEB), Color(0xFF1E6FA8)),
)

/** Stand-in for an agent that has since been deleted: a plain grey placeholder, not a character. */
val FormerAgentAvatar = AvatarSpec(character = 0)

private val Graphite = Color(0xFFA3A8B4)
private val GraphiteOnLight = Color(0xFF52525B)

private val AvatarSpec.isFormer get() = character == 0

/** The agent's character. Numbers out of range wrap, so a newer hub's characters still show something. */
fun AvatarSpec.character(): AgentCharacter = Characters[(character - 1).mod(Characters.size)]

fun randomAvatar(random: Random = Random): AvatarSpec = AvatarSpec(character = random.nextInt(Characters.size) + 1)

/** The agent's signature color, for washes and accents. */
fun AvatarSpec.tint(): Color = if (isFormer) Graphite else character().fill

/** The agent's color as text and accents on a dark or light background. */
fun AvatarSpec.inkColor(dark: Boolean): Color = when {
    isFormer -> if (dark) Graphite else GraphiteOnLight
    dark -> character().fill
    else -> character().onLight
}

/** The agent's color as text on the current background. */
@Composable
fun AvatarSpec.textColor(): Color = inkColor(Orbit.colors.isDark)

/**
 * Each picture is decoded once and shared by every avatar on screen. Mipmaps keep the fur and felt
 * smooth when a 384px picture is drawn at 20dp.
 */
private object CharacterImages {
    private val cache = arrayOfNulls<ImageBitmap>(Characters.size)

    fun get(context: Context, character: AgentCharacter): ImageBitmap =
        cache[character.number - 1] ?: BitmapFactory.decodeResource(context.resources, character.image)
            .apply { setHasMipMap(true) }
            .asImageBitmap()
            .also { cache[character.number - 1] = it }
}

/**
 * An agent's avatar: their character.
 *
 * - [alive]: it breathes, hops now and then, and pops when the character changes. For avatars
 *   someone looks at, not for every face in a list.
 * - [thinking]: a moon in the character's color circles it, and it bobs gently.
 *
 * With system animations off, avatars hold still and changes apply at once.
 */
@Composable
fun AgentAvatar(
    spec: AvatarSpec,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    thinking: Boolean = false,
    alive: Boolean = false,
) {
    val reduced = LocalReducedMotion.current
    val phase = if (thinking && !reduced) thinkingPhase() else null
    val color = spec.tint()
    val satellite = if (thinking) Modifier.drawWithContent {
        drawContent()
        drawSatellite(color, phase?.value ?: 0.125f)
    } else Modifier

    if (spec.isFormer) {
        Spacer(modifier.size(size).then(satellite).drawBehind { drawFormer() })
        return
    }

    val character = spec.character()
    val image = CharacterImages.get(LocalContext.current, character)

    // Idle life, for avatars that are looked at: a slow breath, the odd hop, a pop on a new character.
    val pop = remember { Animatable(1f) }
    val hop = remember { Animatable(0f) }
    val breath = if (alive && !reduced) breathing() else null
    if (alive) {
        LaunchedEffect(character.number) {
            if (reduced) return@LaunchedEffect
            pop.snapTo(0.82f)
            pop.animateTo(1f, OrbitMotion.bouncy())
        }
        if (!reduced) {
            LaunchedEffect(Unit) {
                val random = Random(spec.hashCode())
                while (true) {
                    delay(5000L + random.nextLong(6000))
                    hop.animateTo(1f, tween(170, easing = OrbitMotion.Decelerate))
                    hop.animateTo(0f, OrbitMotion.bouncy())
                }
            }
        }
    }

    Image(
        image,
        contentDescription = null,
        modifier = modifier
            .size(size)
            .then(satellite)
            .graphicsLayer {
                val bob = phase?.let { sin(it.value * 4 * PI).toFloat() * 0.025f } ?: 0f
                val breathe = breath?.value ?: 0f
                // Breathing stretches up from the feet; a hop lifts the whole character.
                transformOrigin = TransformOrigin(0.5f, 1f)
                scaleX = pop.value * (1f - breathe * 0.5f)
                scaleY = pop.value * (1f + breathe)
                translationY = (bob - hop.value * 0.07f) * this.size.height
            },
        filterQuality = FilterQuality.High,
    )
}

@Composable
private fun thinkingPhase(): State<Float> {
    val transition = rememberInfiniteTransition(label = "thinking")
    return transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(2200, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
}

@Composable
private fun breathing(): State<Float> {
    val transition = rememberInfiniteTransition(label = "breath")
    return transition.animateFloat(
        initialValue = 0f,
        targetValue = 0.022f,
        animationSpec = infiniteRepeatable(tween(1900, easing = OrbitMotion.Emphasized), RepeatMode.Reverse),
        label = "breath",
    )
}

/** The mark of an agent at work: a small moon on a faint orbit, trailing light. */
private fun DrawScope.drawSatellite(color: Color, phase: Float) {
    val s = size.minDimension
    val orbit = s * 0.66f
    drawCircle(color.copy(alpha = 0.22f), orbit, center, style = Stroke(width = 1.dp.toPx()))
    for (i in 7 downTo 0) {
        val angle = ((phase - i * 0.022f) * 2 * PI - PI / 4).toFloat()
        val fade = 1f - i / 8f
        drawCircle(
            color.copy(alpha = if (i == 0) 1f else 0.5f * fade * fade),
            s * 0.075f * (if (i == 0) 1f else 0.55f + 0.45f * fade),
            Offset(center.x + orbit * cos(angle), center.y + orbit * sin(angle)),
        )
    }
}

/** A deleted agent: a soft grey disc with two calm eyes. */
private fun DrawScope.drawFormer() {
    val s = size.minDimension
    drawCircle(Graphite.copy(alpha = 0.55f), s * 0.42f, center)
    val w = s * 0.13f
    val h = s * 0.065f
    for (x in listOf(0.38f, 0.62f)) {
        drawRoundRect(Color(0xFF0B0B0F), Offset(s * x - w / 2, s * 0.47f - h / 2), Size(w, h), CornerRadius(h / 2))
    }
}

/** Avatars side by side. [itemModifier] lets each take part in a shared transition. */
@Composable
fun AvatarRow(
    specs: List<AvatarSpec>,
    modifier: Modifier = Modifier,
    size: Dp = 36.dp,
    max: Int = 5,
    gap: Dp = size * 0.1f,
    alive: Boolean = false,
    itemModifier: @Composable (index: Int) -> Modifier = { Modifier },
) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = Alignment.CenterVertically) {
        specs.take(max).forEachIndexed { index, spec -> AgentAvatar(spec, itemModifier(index), size = size, alive = alive) }
    }
}

/**
 * A room's badge: up to three of its members inside one rounded tile, standing together.
 * Never more than three, so each character stays large enough to read.
 */
@Composable
fun CrewTile(
    specs: List<AvatarSpec>,
    modifier: Modifier = Modifier,
    size: Dp = 56.dp,
    color: Color = Orbit.colors.surfaceRaised,
    itemModifier: @Composable (index: Int) -> Modifier = { Modifier },
) {
    // (x, y, diameter) as fractions of the tile. Later ones stand in front.
    val layout = when (minOf(specs.size, 3)) {
        0 -> emptyList()
        1 -> listOf(Triple(0.12f, 0.12f, 0.76f))
        2 -> listOf(Triple(0.02f, 0.06f, 0.62f), Triple(0.36f, 0.34f, 0.62f))
        else -> listOf(Triple(0.24f, 0.02f, 0.52f), Triple(0.0f, 0.44f, 0.52f), Triple(0.48f, 0.44f, 0.52f))
    }
    Box(modifier.size(size).clip(RoundedCornerShape(size * 0.3f)).background(color)) {
        layout.forEachIndexed { index, (x, y, d) ->
            AgentAvatar(specs[index], Modifier.offset(size * x, size * y).then(itemModifier(index)), size * d)
        }
    }
}
