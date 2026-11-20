package dev.orbit.app.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/**
 * Returns a function that opens Google's QR scanner. It runs in Google Play services, so the app
 * needs no camera permission. [onCode] gets the code's text; [onUnavailable] is called if the
 * scanner can't run on this phone. Backing out of the scanner does nothing.
 */
@Composable
fun rememberQrScanner(onCode: (String) -> Unit, onUnavailable: () -> Unit): () -> Unit {
    val context = LocalContext.current
    val code by rememberUpdatedState(onCode)
    val unavailable by rememberUpdatedState(onUnavailable)
    return remember(context) {
        {
            val options = GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build()
            GmsBarcodeScanning.getClient(context, options)
                .startScan()
                .addOnSuccessListener { barcode -> barcode.rawValue?.let { code(it) } }
                .addOnFailureListener { unavailable() }
        }
    }
}
