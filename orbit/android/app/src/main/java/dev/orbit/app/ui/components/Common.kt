package dev.orbit.app.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType

/** Section header in small mono capitals, with an optional count. */
@Composable
fun Overline(text: String, modifier: Modifier = Modifier, count: Int? = null) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(text.uppercase(), style = OrbitType.overline, color = Orbit.colors.textSecondary)
        if (count != null && count > 0) {
            Text(count.toString(), Modifier.padding(start = 8.dp), style = OrbitType.overline, color = Orbit.colors.textTertiary)
        }
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

/** Clickable with a ripple that follows [shape]. */
fun Modifier.tap(shape: Shape = RoundedCornerShape(OrbitDimens.radiusS), onClick: () -> Unit): Modifier =
    clip(shape).clickable(onClick = onClick)

/** A filled surface with a hairline edge: the app's one card style. */
@Composable
fun OrbitCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    color: Color = Orbit.colors.surface,
    edge: Color = Orbit.colors.hairline,
    radius: Dp = OrbitDimens.radiusL,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    val border = BorderStroke(1.dp, edge)
    if (onClick != null) {
        Surface(onClick, modifier, shape = shape, color = color, contentColor = Orbit.colors.text, border = border, content = content)
    } else {
        Surface(modifier, shape = shape, color = color, contentColor = Orbit.colors.text, border = border, content = content)
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
                    .border(1.dp, if (focused) c.line else c.hairline, shape)
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

/** The one filled call to action on a screen. Unavailable, it stays recognisably a button, only dimmed. */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val c = Orbit.colors
    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().height(52.dp),
        enabled = enabled && !loading,
        shape = CircleShape,
        color = if (enabled) c.primary else c.primary.copy(alpha = 0.3f),
        contentColor = c.onPrimary,
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (loading) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = c.onPrimary)
            } else {
                Text(text, style = OrbitType.titleS)
            }
        }
    }
}

/** Small pill for choices and quiet actions. */
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
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = CircleShape,
        color = if (selected) c.primary else c.surfaceRaised,
        contentColor = when {
            selected -> c.onPrimary
            dimmed -> c.textTertiary
            else -> c.text
        },
        border = if (selected) null else BorderStroke(1.dp, c.hairline),
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
    Box(modifier.size(48.dp).tap(CircleShape, onClick), contentAlignment = Alignment.Center) {
        OrbitIcon(icon, tint = tint, description = description)
    }
}

/** Round icon button on a raised surface. */
@Composable
fun IconPill(icon: OrbitIcon, description: String, onClick: () -> Unit, modifier: Modifier = Modifier, size: Dp = 44.dp) {
    Surface(
        onClick = onClick,
        modifier = modifier.size(size),
        shape = CircleShape,
        color = Orbit.colors.surfaceRaised,
        contentColor = Orbit.colors.text,
        border = BorderStroke(1.dp, Orbit.colors.hairline),
    ) {
        Box(contentAlignment = Alignment.Center) { OrbitIcon(icon, size = 20.dp, description = description) }
    }
}

/** Status dot. When [pulsing] a soft halo breathes around it. */
@Composable
fun StatusDot(color: Color, modifier: Modifier = Modifier, pulsing: Boolean = false, size: Dp = 8.dp) {
    val halo = if (pulsing) {
        val transition = rememberInfiniteTransition(label = "status")
        val value by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(1400), RepeatMode.Restart), label = "halo")
        value
    } else {
        null
    }
    Canvas(modifier.size(size)) {
        val r = this.size.minDimension / 2
        if (halo != null) drawCircle(color.copy(alpha = 0.35f * (1f - halo)), r * (1f + 1.4f * halo))
        drawCircle(color, r)
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

/** Top bar for secondary screens: back, title, trailing actions. */
@Composable
fun ScreenBar(title: String, onBack: () -> Unit, actions: @Composable RowScope.() -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().height(60.dp).padding(start = 6.dp, end = OrbitDimens.gutter),
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
}

/** The filled action in a screen bar, e.g. Save. */
@Composable
fun BarAction(label: String, onClick: () -> Unit, enabled: Boolean = true) {
    val c = Orbit.colors
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        color = if (enabled) c.primary else c.primary.copy(alpha = 0.3f),
        contentColor = c.onPrimary,
    ) {
        Box(Modifier.height(40.dp).padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
            Text(label, style = OrbitType.titleS)
        }
    }
}
