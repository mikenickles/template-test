package dev.orbit.app

import android.app.Application
import dev.orbit.app.data.HubRepository

class OrbitApp : Application() {
    val repository by lazy { HubRepository(this) }
}
