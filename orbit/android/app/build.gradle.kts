import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.paparazzi)
}

/**
 * Release signing. The key comes from keystore.properties next to settings.gradle.kts (on your own
 * machine; never committed) or from environment variables (on CI). Every release must be signed with
 * the same key, or phones refuse to install it as an update.
 */
val signingProps = Properties().apply {
    rootProject.file("keystore.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

fun signingValue(property: String, env: String): String? =
    signingProps.getProperty(property)?.takeIf { it.isNotBlank() } ?: System.getenv(env)?.takeIf { it.isNotBlank() }

android {
    namespace = "dev.orbit.app"
    compileSdk {
        version = release(37) { minorApiLevel = 2 }
    }

    defaultConfig {
        applicationId = "dev.orbit.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 6
        versionName = "0.6.0"
    }

    signingConfigs {
        create("release") {
            signingValue("storeFile", "ORBIT_KEYSTORE_FILE")?.let { path ->
                storeFile = rootProject.file(path)
                storePassword = signingValue("storePassword", "ORBIT_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "ORBIT_KEY_ALIAS") ?: "orbit"
                keyPassword = signingValue("keyPassword", "ORBIT_KEY_PASSWORD") ?: storePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Without a key configured, release builds are left unsigned rather than failing.
            signingConfig = signingConfigs.getByName("release").takeIf { it.storeFile != null }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
    }
    testOptions {
        unitTests.all {
            // Paparazzi loads Android's platform classes into the test JVM, which changes how
            // OkHttp behaves in plain JVM tests that run after it. A JVM per test class keeps them apart.
            it.forkEvery = 1
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    implementation(libs.androidx.work.runtime)
    implementation(libs.code.scanner)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
}
