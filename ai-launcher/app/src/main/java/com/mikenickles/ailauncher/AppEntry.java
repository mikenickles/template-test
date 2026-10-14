package com.mikenickles.ailauncher;

import android.content.ComponentName;
import android.graphics.drawable.Drawable;

/** One launchable activity on the device. */
final class AppEntry {
    final String label;
    final ComponentName component;
    final Drawable icon;

    AppEntry(String label, ComponentName component, Drawable icon) {
        this.label = label;
        this.component = component;
        this.icon = icon;
    }

    String packageName() {
        return component.getPackageName();
    }

    /** Stable id used for usage counts and pins. */
    String key() {
        return component.flattenToShortString();
    }
}
