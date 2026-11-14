plugins {
    id("com.android.application")
}

android {
    namespace = "app.arlo"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.arlo"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.8.0")
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    // On-device QR scanner from Google Play services; needs no camera permission.
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}
