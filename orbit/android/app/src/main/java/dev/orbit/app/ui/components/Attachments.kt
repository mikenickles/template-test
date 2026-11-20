package dev.orbit.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.orbit.app.data.Attachment
import dev.orbit.app.data.MAX_IMAGE_EDGE
import dev.orbit.app.ui.DraftAttachment
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType

private val PhotoShape = RoundedCornerShape(18.dp)

/**
 * What came with a message: one photo shown in its own shape, several as a grid of squares, and
 * files as named chips. Tapping a photo opens it full screen.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AttachedItems(attachments: List<Attachment>, onOpenPhoto: (Attachment) -> Unit, modifier: Modifier = Modifier) {
    if (attachments.isEmpty()) return
    val photos = attachments.filter { it.isImage }
    val files = attachments.filterNot { it.isImage }
    Column(modifier, horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (photos.size == 1) {
            val photo = photos.single()
            HubImage(
                photo,
                Modifier.width(232.dp).heightIn(min = 120.dp).clip(PhotoShape).tap(PhotoShape, 0.98f) { onOpenPhoto(photo) },
                aspect = 0.6f..1.6f,
            )
        } else if (photos.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End), verticalArrangement = Arrangement.spacedBy(6.dp), maxItemsInEachRow = 3) {
                for (photo in photos) {
                    HubImage(photo, Modifier.size(96.dp).clip(PhotoShape).tap(PhotoShape, 0.96f) { onOpenPhoto(photo) }, maxEdge = 400)
                }
            }
        }
        for (file in files) FileChip(file.name, fileSize(file.size))
    }
}

@Composable
private fun FileChip(name: String, detail: String, modifier: Modifier = Modifier) {
    val c = Orbit.colors
    Row(
        modifier
            .widthIn(max = 260.dp)
            .clip(RoundedCornerShape(OrbitDimens.radiusM))
            .background(c.surfaceHigh)
            .padding(start = 12.dp, end = 16.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OrbitIcon(OrbitIcon.File, size = 20.dp, tint = c.textSecondary)
        Column(Modifier.padding(start = 10.dp)) {
            Text(name, style = OrbitType.label, color = c.text, maxLines = 1, overflow = TextOverflow.MiddleEllipsis)
            Text(detail, style = OrbitType.caption, color = c.textTertiary)
        }
    }
}

/**
 * Photos and files waiting to go with the next message, each with a way to take it back out.
 * While they upload they dim under a spinner.
 */
@Composable
fun DraftStrip(drafts: List<DraftAttachment>, sending: Boolean, onRemove: (DraftAttachment) -> Unit) {
    val c = Orbit.colors
    AnimatedVisibility(
        drafts.isNotEmpty(),
        enter = expandVertically(OrbitMotion.snappy()) + fadeIn(),
        exit = shrinkVertically(OrbitMotion.snappy()) + fadeOut(),
    ) {
        LazyRow(
            Modifier.padding(top = 10.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(drafts, key = { it.key }) { draft ->
                Box(Modifier.animateItem().padding(top = 6.dp, end = 6.dp)) {
                    val shape = RoundedCornerShape(14.dp)
                    val dim = Modifier.alpha(if (sending) 0.45f else 1f)
                    val preview = draft.preview
                    if (draft.isImage && preview != null) {
                        Image(preview, draft.name, dim.size(64.dp).clip(shape), contentScale = ContentScale.Crop)
                    } else {
                        Column(
                            dim.size(width = 132.dp, height = 64.dp).clip(shape).background(c.surfaceHigh).padding(10.dp),
                            verticalArrangement = Arrangement.SpaceBetween,
                        ) {
                            OrbitIcon(OrbitIcon.File, size = 18.dp, tint = c.textSecondary)
                            Text(draft.name, style = OrbitType.caption, color = c.text, maxLines = 1, overflow = TextOverflow.MiddleEllipsis)
                        }
                    }
                    if (sending) {
                        OrbitSpinner(c.text, Modifier.align(Alignment.Center), size = 18.dp)
                    } else {
                        // A small badge at the corner, with a full-size touch target around it.
                        Box(
                            Modifier
                                .align(Alignment.TopEnd)
                                .padding(top = 0.dp)
                                .size(32.dp)
                                .padding(5.dp)
                                .clip(CircleShape)
                                .clickable(onClickLabel = "Remove ${draft.name}") { onRemove(draft) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(
                                Modifier.size(20.dp).clip(CircleShape).background(c.surface).border(1.dp, c.hairline, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                OrbitIcon(OrbitIcon.Close, size = 12.dp, tint = c.text)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** A photo on its own, filling the screen. Tap anywhere or go back to close. */
@Composable
fun PhotoViewer(photo: Attachment, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black)
                .clickable(remember { MutableInteractionSource() }, indication = null, onClickLabel = "Close", onClick = onDismiss),
            contentAlignment = Alignment.Center,
        ) {
            HubImage(photo, Modifier.fillMaxSize(), maxEdge = MAX_IMAGE_EDGE, contentScale = ContentScale.Fit)
            Text(
                photo.name,
                Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 16.dp, start = 64.dp, end = 64.dp).height(20.dp),
                style = OrbitType.label,
                color = Color.White.copy(alpha = 0.8f),
                maxLines = 1,
                overflow = TextOverflow.MiddleEllipsis,
            )
        }
    }
}
