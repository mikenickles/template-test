package dev.orbit.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import dev.orbit.app.ui.UpdateStatus
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType

/**
 * "Orbit 0.11.0 is ready": the app update the PC is holding, with its Update button and, once tapped,
 * the download's progress or what went wrong.
 */
@Composable
fun UpdateCard(version: String, status: UpdateStatus, onUpdate: () -> Unit, modifier: Modifier = Modifier) {
    val c = Orbit.colors
    OrbitCard(modifier.fillMaxWidth()) {
        Column(Modifier.padding(start = OrbitDimens.rowPad, end = 12.dp, top = 14.dp, bottom = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Orbit $version is ready", style = OrbitType.titleS, color = c.text)
                    Text(
                        when (status) {
                            is UpdateStatus.Downloading -> "Downloading from your PC… ${status.percent}%"
                            UpdateStatus.NeedsPermission ->
                                "Allow Orbit to install updates in the screen that just opened, then come back and tap Update."
                            else -> "From your PC. Android will ask you to confirm."
                        },
                        Modifier.padding(top = 2.dp),
                        style = OrbitType.bodyS,
                        color = c.textSecondary,
                    )
                }
                if (status !is UpdateStatus.Downloading) {
                    Pill(if (status is UpdateStatus.Failed) "Try again" else "Update", onUpdate, Modifier.padding(start = 12.dp), selected = true)
                }
            }
            if (status is UpdateStatus.Downloading) {
                Box(Modifier.padding(top = 12.dp, end = 4.dp).fillMaxWidth().height(6.dp).clip(CircleShape).background(c.surfaceHigh)) {
                    Box(Modifier.fillMaxWidth((status.percent / 100f).coerceIn(0.02f, 1f)).fillMaxHeight().clip(CircleShape).background(c.primary))
                }
            }
            if (status is UpdateStatus.Failed) {
                Text(status.message, Modifier.padding(top = 10.dp), style = OrbitType.bodyS, color = c.danger)
            }
        }
    }
}

/**
 * "Orbit 0.15.0 is ready for your PC": a hub update waiting on the PC, installable from the phone.
 * While it installs, the hub restarts and the card says so.
 */
@Composable
fun PcUpdateCard(version: String, updating: Boolean, onUpdate: () -> Unit, modifier: Modifier = Modifier) {
    val c = Orbit.colors
    OrbitCard(modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = OrbitDimens.rowPad, end = 12.dp, top = 14.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Orbit $version is ready for your PC", style = OrbitType.titleS, color = c.text)
                Text(
                    if (updating) "Your PC is updating and restarting. This takes a few seconds." else "Install it from here. Your phone gets its update right after.",
                    Modifier.padding(top = 2.dp),
                    style = OrbitType.bodyS,
                    color = c.textSecondary,
                )
            }
            if (updating) OrbitSpinner(c.text, Modifier.padding(start = 12.dp)) else Pill("Update PC", onUpdate, Modifier.padding(start = 12.dp), selected = true)
        }
    }
}
