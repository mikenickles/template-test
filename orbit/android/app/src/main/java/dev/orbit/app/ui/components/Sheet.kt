package dev.orbit.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.rememberHaptics
import kotlinx.coroutines.launch

/** One choice in an [ActionSheet]. A [danger] action is drawn in the danger color. */
data class SheetAction(val label: String, val icon: OrbitIcon, val danger: Boolean = false, val onClick: () -> Unit)

/**
 * A sheet of actions that rises from the bottom, for things done to one item (a message, say). The
 * sheet slides away before the chosen action runs, so the result is seen, not hidden behind it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActionSheet(onDismiss: () -> Unit, title: String?, preview: String?, actions: List<SheetAction>) {
    val c = Orbit.colors
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        shape = RoundedCornerShape(topStart = OrbitDimens.radiusXL, topEnd = OrbitDimens.radiusXL),
        containerColor = c.surface,
        contentColor = c.text,
        scrimColor = c.bg.copy(alpha = 0.6f),
        dragHandle = { SheetHandle() },
    ) {
        ActionSheetContent(title, preview, actions) { action ->
            scope.launch { state.hide() }.invokeOnCompletion {
                onDismiss()
                action.onClick()
            }
        }
    }
}

@Composable
private fun SheetHandle() {
    Box(Modifier.padding(top = 10.dp, bottom = 6.dp).size(width = 36.dp, height = 4.dp).background(Orbit.colors.line, CircleShape))
}

/** The inside of an [ActionSheet]: what it is about, then one row per action. */
@Composable
fun ActionSheetContent(title: String?, preview: String?, actions: List<SheetAction>, onAction: (SheetAction) -> Unit) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 12.dp)) {
        if (title != null || preview != null) {
            Column(Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 8.dp, bottom = 12.dp)) {
                title?.let { Text(it, style = OrbitType.titleS, color = c.text) }
                // A plain-text glimpse: markdown markers and line breaks would only add noise here.
                preview?.replace(Regex("[*_`#>]+"), "")?.replace(Regex("\\s+"), " ")?.trim()?.takeIf { it.isNotEmpty() }?.let {
                    Text(
                        it,
                        Modifier.padding(top = 4.dp),
                        style = OrbitType.bodyS,
                        color = c.textSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Hairline()
        }
        for (action in actions) {
            val ink = if (action.danger) c.danger else c.text
            Row(
                Modifier
                    .fillMaxWidth()
                    .tap(RectangleShape, 0.985f) {
                        haptics.tick()
                        onAction(action)
                    }
                    .heightIn(min = 56.dp)
                    .padding(horizontal = OrbitDimens.gutter),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OrbitIcon(action.icon, size = 20.dp, tint = ink)
                Text(action.label, Modifier.padding(start = 16.dp), style = OrbitType.titleS, color = ink)
            }
        }
    }
}
