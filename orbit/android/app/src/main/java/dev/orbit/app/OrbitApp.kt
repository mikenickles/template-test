package dev.orbit.app

import android.app.Application
import dev.orbit.app.data.HubImageCache
import dev.orbit.app.data.HubRepository
import dev.orbit.app.notify.ReplyWatcher

class OrbitApp : Application() {
    val repository by lazy { HubRepository(this) }
    val images by lazy { HubImageCache(repository) }

    override fun onCreate() {
        super.onCreate()
        ReplyWatcher.createChannels(this)
    }
}
