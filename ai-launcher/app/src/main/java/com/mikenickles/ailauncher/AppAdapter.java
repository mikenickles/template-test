package com.mikenickles.ailauncher;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Grid adapter over the installed apps, filtered by the text in the prompt box. */
final class AppAdapter extends BaseAdapter {
    private final LayoutInflater inflater;
    private List<AppEntry> all = new ArrayList<AppEntry>();
    private final List<AppEntry> shown = new ArrayList<AppEntry>();
    private String query = "";

    AppAdapter(LayoutInflater inflater) {
        this.inflater = inflater;
    }

    void setApps(List<AppEntry> apps) {
        all = apps;
        applyFilter();
    }

    void setQuery(String q) {
        query = q.trim().toLowerCase(Locale.getDefault());
        applyFilter();
    }

    private void applyFilter() {
        shown.clear();
        if (query.isEmpty()) {
            shown.addAll(all);
        } else {
            // Prefix matches first, then substring matches anywhere in the label.
            List<AppEntry> contains = new ArrayList<AppEntry>();
            for (AppEntry e : all) {
                String label = e.label.toLowerCase(Locale.getDefault());
                if (label.startsWith(query)) {
                    shown.add(e);
                } else if (label.contains(query)) {
                    contains.add(e);
                }
            }
            shown.addAll(contains);
        }
        notifyDataSetChanged();
    }

    @Override
    public int getCount() {
        return shown.size();
    }

    @Override
    public AppEntry getItem(int position) {
        return shown.get(position);
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        View v = convertView != null ? convertView : inflater.inflate(R.layout.item_app, parent, false);
        AppEntry e = shown.get(position);
        ((ImageView) v.findViewById(R.id.app_icon)).setImageDrawable(e.icon);
        ((TextView) v.findViewById(R.id.app_label)).setText(e.label);
        return v;
    }
}
