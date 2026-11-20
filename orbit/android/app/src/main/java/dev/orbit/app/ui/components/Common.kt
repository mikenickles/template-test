package dev.orbit.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import dev.orbit.app.ui.theme.LocalReducedMotion
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.pressScale
import dev.orbit.app.ui.theme.rememberHaptics
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** A section heading, with an optional count and an action on the right. */
@Composable
fun SectionTitle(
    text: String,
    modifier: Modifier = Modifier,
    count: Int? = null,
    action: (@Composable () -> Unit)? = null,
) {
    Row(modifier.fillMaxWidth().heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = OrbitType.heading, color = Orbit.colors.text)
        if (count != null && count > 0) {
            Text(count.toString(), Modifier.padding(start = 8.dp), style = OrbitType.heading, color = Orbit.colors.textTertiary)
        }
        Spacer(Modifier.weight(1f))
        action?.invoke()
    }
}

/** Names the control below it. */
@Composable
fun FieldLabel(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier.padding(bottom = OrbitDimens.labelGap), style = OrbitType.label, color = Orbit.colors.textSecondary)
}

@Composable
fun Hairline(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(Orbit.colors.hairline))
}

/** Clickable with a ripple that follows [shape] and a slight press-in. */
fun Modifier.tap(
    shape: Shape = RoundedCornerShape(OrbitDimens.radiusS),
    pressed: Float = 0.96f,
    onClick: () -> Unit,
): Modifier = composed {
    val interaction = remember { MutableInteractionSource() }
    pressScale(interaction, pressed).clip(shape).clickable(interaction, indication = androidx.compose.material3.ripple(), onClick = onClick)
}

/** The 1dp edge of a surface: lit from above in dark mode, a plain hairline in light mode. */
@Composable
fun surfaceBorder(): BorderStroke {
    val c = Orbit.colors
    return if (c.isDark) {
        BorderStroke(1.dp, Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.13f), Color.White.copy(alpha = 0.04f))))
    } else {
        BorderStroke(1.dp, c.hairline)
    }
}

/** A soft shadow under a surface in light mode. Dark mode relies on the lit edge instead. */
@Composable
fun Modifier.lift(shape: Shape, strength: Float = 1f): Modifier =
    if (Orbit.colors.isDark) {
        this
    } else {
        this.dropShadow(shape, Shadow(radius = 18.dp, color = Color.Black, offset = DpOffset(0.dp, 4.dp), alpha = 0.07f * strength))
    }

/** A filled surface with a lit edge: the app's one card style. */
@Composable
fun OrbitCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    color: Color = Orbit.colors.surface,
    border: BorderStroke = surfaceBorder(),
    radius: Dp = OrbitDimens.radiusL,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    if (onClick != null) {
        val interaction = remember { MutableInteractionSource() }
        Surface(
            onClick, modifier.lift(shape).pressScale(interaction, 0.985f), shape = shape, color = color,
            contentColor = Orbit.colors.text, border = border, interactionSource = interaction, content = content,
        )
    } else {
        Surface(modifier.lift(shape), shape = shape, color = color, contentColor = Orbit.colors.text, border = border, content = content)
    }
}

/** Text input: softly filled, hairline edge that firms up on focus. */
@Composable
fun OrbitField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else 12,
    textStyle: TextStyle = OrbitType.body,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    trailing: (@Composable () -> Unit)? = null,
) {
    val c = Orbit.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val edge by animateColorAsState(if (focused) c.text.copy(alpha = 0.55f) else c.hairline, tween(OrbitMotion.SHORT), label = "edge")
    val shape = RoundedCornerShape(OrbitDimens.radiusM)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        textStyle = textStyle.copy(color = c.text),
        cursorBrush = SolidColor(c.text),
        singleLine = singleLine,
        minLines = minLines,
        maxLines = maxLines,
        keyboardOptions = keyboardOptions,
        interactionSource = interaction,
        decorationBox = { inner ->
            Row(
                Modifier
                    .clip(shape)
                    .background(c.surfaceRaised)
                    .border(1.dp, edge, shape)
                    .heightIn(min = 52.dp)
                    .padding(start = OrbitDimens.rowPad, end = if (trailing == null) OrbitDimens.rowPad else 4.dp),
                verticalAlignment = if (singleLine) Alignment.CenterVertically else Alignment.Top,
            ) {
                Box(Modifier.weight(1f).padding(vertical = 14.dp)) {
                    if (value.isEmpty()) {
                        Text(placeholder, style = textStyle, color = c.textTertiary, maxLines = if (singleLine) 1 else 3, overflow = TextOverflow.Ellipsis)
                    }
                    inner()
                }
                trailing?.invoke()
            }
        },
    )
}

/** The one filled call to action on a screen. Unavailable, it steps back to an outlined, quiet button. */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val interaction = remember { MutableInteractionSource() }
    val fill by animateColorAsState(if (enabled) c.primary else c.surfaceRaised, tween(OrbitMotion.MEDIUM), label = "fill")
    val ink by animateColorAsState(if (enabled) c.onPrimary else c.textTertiary, tween(OrbitMotion.MEDIUM), label = "ink")
    Surface(
        onClick = {
            haptics.tick()
            onClick()
        },
        modifier = modifier.fillMaxWidth().height(52.dp).pressScale(interaction, 0.97f),
        enabled = enabled && !loading,
        shape = CircleShape,
        color = fill,
        contentColor = ink,
        border = BorderStroke(1.dp, if (enabled) Color.Transparent else c.hairline),
        interactionSource = interaction,
    ) {
        AnimatedContent(
            loading,
            transitionSpec = { (fadeIn(tween(180)) + scaleIn(initialScale = 0.8f)) togetherWith fadeOut(tween(120)) },
            contentAlignment = Alignment.Center,
            label = "loading",
        ) { busy ->
            Box(contentAlignment = Alignment.Center) {
                if (busy) OrbitSpinner(ink, size = 22.dp) else Text(text, style = OrbitType.titleS)
            }
        }
    }
}

/** Small pill for choices and quiet actions. Selecting it crossfades the fill. */
@Composable
fun Pill(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    dimmed: Boolean = false,
    textStyle: TextStyle = OrbitType.label,
    leading: (@Composable () -> Unit)? = null,
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val interaction = remember { MutableInteractionSource() }
    val fill by animateColorAsState(if (selected) c.primary else c.surfaceRaised, OrbitMotion.snappy(), label = "fill")
    val ink by animateColorAsState(
        when {
            selected -> c.onPrimary
            dimmed -> c.textTertiary
            else -> c.text
        },
        OrbitMotion.snappy(),
        label = "ink",
    )
    Surface(
        onClick = {
            haptics.tick()
            onClick()
        },
        modifier = modifier.pressScale(interaction),
        shape = CircleShape,
        color = fill,
        contentColor = ink,
        border = BorderStroke(1.dp, if (selected) Color.Transparent else c.hairline),
        interactionSource = interaction,
    ) {
        Row(
            Modifier.height(40.dp).padding(start = if (leading == null) 16.dp else 7.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (leading != null) {
                leading()
                Spacer(Modifier.width(8.dp))
            }
            Text(label, style = textStyle, maxLines = 1)
        }
    }
}

/** A bare icon with a full-size touch target. */
@Composable
fun IconTap(icon: OrbitIcon, description: String, onClick: () -> Unit, modifier: Modifier = Modifier, tint: Color = Orbit.colors.text) {
    Box(modifier.size(48.dp).tap(CircleShape, 0.88f, onClick), contentAlignment = Alignment.Center) {
        OrbitIcon(icon, tint = tint, description = description)
    }
}

/** Round icon button on a raised surface. [iconModifier] lets a caller animate the icon itself. */
@Composable
fun IconPill(
    icon: OrbitIcon,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    iconModifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val shape = CircleShape
    Surface(
        onClick = onClick,
        modifier = modifier.size(size).lift(shape, 0.6f).pressScale(interaction, 0.88f),
        shape = shape,
        color = Orbit.colors.surfaceRaised,
        contentColor = Orbit.colors.text,
        border = surfaceBorder(),
        interactionSource = interaction,
    ) {
        Box(contentAlignment = Alignment.Center) { OrbitIcon(icon, iconModifier, size = 20.dp, description = description) }
    }
}

/** A small status dot. */
@Composable
fun StatusDot(color: Color, modifier: Modifier = Modifier, size: Dp = 8.dp) {
    Canvas(modifier.size(size)) { drawCircle(color) }
}

/** Loading, Orbit-style: a moon circling a dot, with a fading trail. */
@Composable
fun OrbitSpinner(color: Color, modifier: Modifier = Modifier, size: Dp = 20.dp) {
    val transition = rememberInfiniteTransition(label = "spinner")
    val spin = transition.animateFloat(0f, 1f, infiniteRepeatable(tween(900, easing = LinearEasing)), label = "turn")
    val still = LocalReducedMotion.current
    Canvas(modifier.size(size)) {
        val turn = if (still) 0.125f else spin.value
        val s = this.size.minDimension
        val orbit = s * 0.36f
        drawCircle(color, s * 0.15f)
        for (i in 0 until 6) {
            val angle = (turn - i * 0.045f) * 2 * PI.toFloat()
            drawCircle(
                color.copy(alpha = 1f - i / 6f),
                s * (0.1f - i * 0.009f),
                Offset(center.x + orbit * cos(angle), center.y + orbit * sin(angle)),
            )
        }
    }
}

/** The Orbit mark: a dot with two eyes and a satellite, in the current text color. */
@Composable
fun LogoMark(modifier: Modifier = Modifier, size: Dp = 26.dp) {
    val fill = Orbit.colors.text
    val eye = Orbit.colors.bg
    Canvas(modifier.size(size)) {
        val s = this.size.minDimension
        val center = Offset(s * 0.44f, s * 0.57f)
        drawCircle(fill, s * 0.4f, center)
        for (dx in listOf(-0.14f, 0.14f)) {
            drawRoundRect(
                eye,
                topLeft = Offset(center.x + s * dx - s * 0.055f, center.y - s * 0.14f),
                size = Size(s * 0.11f, s * 0.26f),
                cornerRadius = CornerRadius(s * 0.055f),
            )
        }
        drawCircle(fill, s * 0.11f, Offset(s * 0.87f, s * 0.13f))
    }
}

/**
 * Top bar for secondary screens: back, title, trailing actions.
 * A hairline fades in under it once content has [scrolled] beneath.
 */
@Composable
fun ScreenBar(title: String, onBack: () -> Unit, scrolled: Boolean = false, actions: @Composable RowScope.() -> Unit = {}) {
    val divider by animateColorAsState(if (scrolled) Orbit.colors.hairline else Color.Transparent, tween(OrbitMotion.MEDIUM), label = "divider")
    Box(Modifier.fillMaxWidth().background(Orbit.colors.bg).statusBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().height(60.dp).padding(start = 6.dp, end = OrbitDimens.gutter),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconTap(OrbitIcon.Back, "Back", onBack)
            Text(
                title,
                Modifier.weight(1f).padding(start = 2.dp),
                style = OrbitType.titleM,
                color = Orbit.colors.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            actions()
        }
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(1.dp).background(divider))
    }
}

/** The filled action in a screen bar, e.g. Save. */
@Composable
fun BarAction(label: String, onClick: () -> Unit, enabled: Boolean = true) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val interaction = remember { MutableInteractionSource() }
    val fill by animateColorAsState(if (enabled) c.primary else c.surfaceRaised, tween(OrbitMotion.MEDIUM), label = "fill")
    val ink by animateColorAsState(if (enabled) c.onPrimary else c.textTertiary, tween(OrbitMotion.MEDIUM), label = "ink")
    Surface(
        onClick = {
            haptics.tick()
            onClick()
        },
        modifier = Modifier.pressScale(interaction),
        enabled = enabled,
        shape = CircleShape,
        color = fill,
        contentColor = ink,
        border = BorderStroke(1.dp, if (enabled) Color.Transparent else c.hairline),
        interactionSource = interaction,
    ) {
        Box(Modifier.height(40.dp).padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
            Text(label, style = OrbitType.titleS)
        }
    }
}

/** A destructive action as a full-width outlined row. */
@Composable
fun DangerRow(label: String, onClick: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusM)
    Box(
        Modifier.fillMaxWidth().height(52.dp).tap(shape, 0.98f, onClick).border(1.dp, c.hairline, shape).background(c.surface),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = OrbitType.titleS, color = c.danger)
    }
}
