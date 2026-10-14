package com.mikenickles.ailauncher;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.AlarmClock;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.EditText;
import android.widget.GridView;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Callable;
import java.util.concurrent.FutureTask;

/**
 * Home screen built around one prompt bar. Typing filters apps (Enter opens a clear match);
 * anything else goes to Claude, whose reply streams into a conversation above the bar.
 */
public class LauncherActivity extends Activity implements ClaudeClient.Actions {

    private static final String PREFS = "settings";
    private static final String KEY_API_KEY = "api_key";
    private static final String KEY_MODEL = "model";
    private static final String KEY_NAME = "name";
    private static final String KEY_CITY = "city";
    private static final String DEFAULT_MODEL = "claude-opus-5-5";
    private static final int DOCK_SIZE = 5;
    private static final int REQUEST_VOICE = 1;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ClaudeClient claude = new ClaudeClient();

    private AppStore store;
    private AppAdapter adapter;
    private volatile List<AppEntry> apps = new ArrayList<AppEntry>();

    private LayoutInflater inflater;
    private SharedPreferences prefs;
    private TextView greeting;
    private ScrollView chatScroll;
    private LinearLayout chatList;
    private View drawer;
    private TextView drawerHint;
    private LinearLayout dock;
    private View chipsScroll;
    private LinearLayout chips;
    private EditText prompt;
    private ImageButton actionButton;
    private ImageButton appsButton;
    private View glow;
    private ObjectAnimator glowPulse;

    private boolean drawerPinnedOpen;
    private boolean busy;

    private final BroadcastReceiver packageReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            loadApps();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_launcher);
        inflater = getLayoutInflater();
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        store = new AppStore(this);

        greeting = (TextView) findViewById(R.id.greeting);
        chatScroll = (ScrollView) findViewById(R.id.chat_scroll);
        chatList = (LinearLayout) findViewById(R.id.chat_list);
        drawer = findViewById(R.id.drawer);
        drawerHint = (TextView) findViewById(R.id.drawer_hint);
        dock = (LinearLayout) findViewById(R.id.dock);
        chipsScroll = findViewById(R.id.chips_scroll);
        chips = (LinearLayout) findViewById(R.id.chips);
        prompt = (EditText) findViewById(R.id.prompt);
        actionButton = (ImageButton) findViewById(R.id.action_button);
        appsButton = (ImageButton) findViewById(R.id.apps_button);
        glow = findViewById(R.id.glow);

        adapter = new AppAdapter(inflater);
        GridView grid = (GridView) findViewById(R.id.app_grid);
        grid.setAdapter(adapter);
        grid.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                launch(adapter.getItem(position), view);
            }
        });
        grid.setOnItemLongClickListener(new AdapterView.OnItemLongClickListener() {
            @Override
            public boolean onItemLongClick(AdapterView<?> parent, View view, int position, long id) {
                showAppMenu(adapter.getItem(position), view);
                return true;
            }
        });

        prompt.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                adapter.setQuery(s.toString());
                updateMode();
            }

            @Override
            public void afterTextChanged(Editable s) {
            }
        });
        prompt.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER
                        && event.getAction() == KeyEvent.ACTION_DOWN;
                if (actionId == EditorInfo.IME_ACTION_SEND || enter) {
                    submit();
                    return true;
                }
                return false;
            }
        });

        actionButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                String text = prompt.getText().toString().trim();
                if (text.isEmpty()) {
                    startVoice();
                } else {
                    ask(text);
                }
            }
        });
        appsButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                drawerPinnedOpen = !drawerPinnedOpen;
                updateMode();
            }
        });
        drawerHint.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String text = prompt.getText().toString().trim();
                if (!text.isEmpty()) {
                    ask(text);
                }
            }
        });
        findViewById(R.id.settings).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showSettings();
            }
        });

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_PACKAGE_ADDED);
        filter.addAction(Intent.ACTION_PACKAGE_REMOVED);
        filter.addAction(Intent.ACTION_PACKAGE_CHANGED);
        filter.addDataScheme("package");
        registerReceiver(packageReceiver, filter);

        glowPulse = ObjectAnimator.ofFloat(glow, "alpha", 0.35f, 1f);
        glowPulse.setDuration(900);
        glowPulse.setRepeatMode(ValueAnimator.REVERSE);
        glowPulse.setRepeatCount(ValueAnimator.INFINITE);

        loadApps();
        updateMode();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateGreeting();
        buildChips();
        rebuildDock();
        if (chatList.getChildCount() == 0 || chatList.getChildAt(0).getId() == R.id.welcome) {
            showWelcomeIfNeeded();
        }
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(packageReceiver);
        super.onDestroy();
    }

    /** Pressing Home while already on the launcher clears the screen and starts a new conversation. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        resetHome();
    }

    @Override
    public void onBackPressed() {
        // A launcher has nowhere to go back to: close the drawer, then clear the prompt.
        if (drawerPinnedOpen || prompt.length() > 0) {
            drawerPinnedOpen = false;
            prompt.setText("");
            hideKeyboard();
            updateMode();
        }
    }

    private void resetHome() {
        drawerPinnedOpen = false;
        prompt.setText("");
        hideKeyboard();
        if (!busy) {
            claude.reset();
            chatList.removeAllViews();
            showWelcomeIfNeeded();
        }
        updateMode();
    }

    // ---- Layout state -----------------------------------------------------------------------

    /** Switches between conversation and app drawer based on the prompt text and toggles. */
    private void updateMode() {
        String query = prompt.getText().toString().trim();
        boolean typing = !query.isEmpty();
        boolean drawerOpen = drawerPinnedOpen || (typing && adapter.getCount() > 0);

        drawer.setVisibility(drawerOpen ? View.VISIBLE : View.GONE);
        chatScroll.setVisibility(drawerOpen ? View.GONE : View.VISIBLE);
        dock.setVisibility(drawerOpen ? View.GONE : View.VISIBLE);
        chipsScroll.setVisibility(typing || busy ? View.GONE : View.VISIBLE);
        appsButton.setImageResource(drawerOpen ? R.drawable.ic_close : R.drawable.ic_apps);

        actionButton.setImageResource(typing ? R.drawable.ic_send : R.drawable.ic_mic);
        actionButton.setContentDescription(getString(typing ? R.string.send : R.string.voice));

        if (typing) {
            AppEntry match = clearMatch(query);
            drawerHint.setText(match != null
                    ? "↵  Open " + match.label + "   ·   ✦ tap to ask Claude"
                    : "✦  Ask Claude “" + query + "”");
            drawerHint.setVisibility(View.VISIBLE);
        } else {
            drawerHint.setVisibility(View.GONE);
        }
    }

    /** The app Enter should open: an exact label match, or the only app matching the query. */
    private AppEntry clearMatch(String query) {
        for (int i = 0; i < adapter.getCount(); i++) {
            if (adapter.getItem(i).label.equalsIgnoreCase(query)) {
                return adapter.getItem(i);
            }
        }
        if (adapter.getCount() == 1
                && adapter.getItem(0).label.toLowerCase(Locale.getDefault())
                .startsWith(query.toLowerCase(Locale.getDefault()))) {
            return adapter.getItem(0);
        }
        return null;
    }

    private void submit() {
        String text = prompt.getText().toString().trim();
        if (text.isEmpty()) {
            return;
        }
        AppEntry match = clearMatch(text);
        if (match != null) {
            launch(match, prompt);
            prompt.setText("");
            hideKeyboard();
        } else {
            ask(text);
        }
    }

    private void updateGreeting() {
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        String part = hour < 5 ? "Good night" : hour < 12 ? "Good morning"
                : hour < 17 ? "Good afternoon" : hour < 22 ? "Good evening" : "Good night";
        String name = prefs.getString(KEY_NAME, "").trim();
        greeting.setText(name.isEmpty() ? part : part + ", " + name);
    }

    /** Suggestions that change with the time of day. Tapping one asks Claude right away. */
    private void buildChips() {
        chips.removeAllViews();
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        List<String[]> list = new ArrayList<String[]>();
        if (chatList.getChildCount() > 0 && chatList.getChildAt(0).getId() != R.id.welcome) {
            list.add(new String[]{getString(R.string.new_chat), null});
        }
        if (hour >= 5 && hour < 11) {
            list.add(new String[]{"☀️ Morning briefing",
                    "Give me a quick morning briefing: today's weather and the top 3 headlines."});
        } else if (hour >= 11 && hour < 15) {
            list.add(new String[]{"🍜 Lunch nearby", "Find a good lunch spot near me."});
        } else if (hour >= 17 && hour < 22) {
            list.add(new String[]{"🍝 Dinner idea", "Suggest an easy dinner I can make in 30 minutes."});
        } else if (hour >= 22 || hour < 5) {
            list.add(new String[]{"⏰ Alarm for 7", "Set an alarm for 7:00 AM."});
        }
        list.add(new String[]{"🌤 Weather", "What's the weather today and tomorrow?"});
        list.add(new String[]{"📰 Headlines", "What are today's top headlines?"});
        list.add(new String[]{"⏱ 10 min timer", "Set a 10 minute timer."});
        list.add(new String[]{"☕ Coffee nearby", "Show me coffee shops near me on the map."});
        list.add(new String[]{"💡 Surprise me", "Tell me one genuinely surprising fact."});

        for (final String[] chip : list) {
            TextView v = (TextView) inflater.inflate(R.layout.item_chip, chips, false);
            v.setText(chip[0]);
            v.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                    if (chip[1] == null) {
                        resetHome();
                        buildChips();
                    } else {
                        ask(chip[1]);
                    }
                }
            });
            chips.addView(v);
        }
    }

    private void showWelcomeIfNeeded() {
        chatList.removeAllViews();
        boolean needsKey = prefs.getString(KEY_API_KEY, "").trim().isEmpty();
        boolean needsHome = !store.isDefaultHome();
        if (!needsKey && !needsHome) {
            return;
        }
        View card = inflater.inflate(R.layout.item_welcome, chatList, false);
        card.setId(R.id.welcome);
        View key = card.findViewById(R.id.setup_key);
        View home = card.findViewById(R.id.setup_home);
        key.setVisibility(needsKey ? View.VISIBLE : View.GONE);
        home.setVisibility(needsHome ? View.VISIBLE : View.GONE);
        key.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showSettings();
            }
        });
        home.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openHomeSettings();
            }
        });
        chatList.addView(card);
    }

    private void openHomeSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_HOME_SETTINGS));
        } catch (ActivityNotFoundException e) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }

    // ---- Apps -------------------------------------------------------------------------------

    private void loadApps() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                final List<AppEntry> loaded = store.loadApps();
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        apps = loaded;
                        adapter.setApps(loaded);
                        rebuildDock();
                        updateMode();
                    }
                });
            }
        }).start();
    }

    private void rebuildDock() {
        dock.removeAllViews();
        for (final AppEntry e : store.dock(apps, DOCK_SIZE)) {
            View v = inflater.inflate(R.layout.item_app, dock, false);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            v.setLayoutParams(lp);
            ((ImageView) v.findViewById(R.id.app_icon)).setImageDrawable(e.icon);
            ((TextView) v.findViewById(R.id.app_label)).setText(e.label);
            v.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    launch(e, view);
                }
            });
            v.setOnLongClickListener(new View.OnLongClickListener() {
                @Override
                public boolean onLongClick(View view) {
                    showAppMenu(e, view);
                    return true;
                }
            });
            dock.addView(v);
        }
    }

    private void launch(AppEntry e, View source) {
        if (source != null) {
            source.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        }
        Intent i = new Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(e.component)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            startActivity(i);
            store.recordLaunch(e);
        } catch (ActivityNotFoundException | SecurityException ex) {
            Toast.makeText(this, "Can't open " + e.label, Toast.LENGTH_SHORT).show();
        }
    }

    private void showAppMenu(final AppEntry e, View anchor) {
        anchor.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
        String[] items = {
                getString(store.isPinned(e) ? R.string.unpin : R.string.pin),
                getString(R.string.app_info),
                getString(R.string.uninstall),
        };
        new AlertDialog.Builder(this)
                .setTitle(e.label)
                .setIcon(e.icon)
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        Uri pkg = Uri.fromParts("package", e.packageName(), null);
                        if (which == 0) {
                            store.togglePin(e);
                            rebuildDock();
                        } else if (which == 1) {
                            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg));
                        } else {
                            startActivity(new Intent(Intent.ACTION_DELETE, pkg));
                        }
                    }
                })
                .show();
    }

    // ---- Voice ------------------------------------------------------------------------------

    private void startVoice() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PROMPT, getString(R.string.voice_prompt));
        try {
            startActivityForResult(i, REQUEST_VOICE);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No voice input app is installed.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_VOICE || resultCode != RESULT_OK || data == null) {
            return;
        }
        ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (results != null && !results.isEmpty()) {
            String spoken = results.get(0).trim();
            // "Open Spotify" / "Spotify" opens the app directly; everything else goes to Claude.
            String name = spoken.replaceFirst("(?i)^(open|launch|start)\\s+", "");
            adapter.setQuery(name);
            AppEntry match = clearMatch(name);
            adapter.setQuery("");
            if (match != null) {
                launch(match, prompt);
            } else {
                ask(spoken);
            }
        }
    }

    // ---- Claude -----------------------------------------------------------------------------

    private void ask(final String text) {
        if (text.isEmpty() || busy) {
            return;
        }
        final String apiKey = prefs.getString(KEY_API_KEY, "").trim();
        if (apiKey.isEmpty()) {
            showSettings();
            return;
        }
        String savedModel = prefs.getString(KEY_MODEL, DEFAULT_MODEL).trim();
        final String model = savedModel.isEmpty() ? DEFAULT_MODEL : savedModel;

        if (chatList.getChildCount() > 0 && chatList.getChildAt(0).getId() == R.id.welcome) {
            chatList.removeAllViews();
        }
        busy = true;
        drawerPinnedOpen = false;
        prompt.setText("");
        hideKeyboard();
        updateMode();
        glowPulse.start();

        TextView user = (TextView) inflater.inflate(R.layout.item_msg_user, chatList, false);
        user.setText(text);
        addToChat(user);
        final View bubble = inflater.inflate(R.layout.item_msg_ai, chatList, false);
        addToChat(bubble);
        final TextView status = (TextView) bubble.findViewById(R.id.status);
        final View statusRow = bubble.findViewById(R.id.status_row);
        final TextView body = (TextView) bubble.findViewById(R.id.text);
        final LinearLayout actions = (LinearLayout) bubble.findViewById(R.id.actions);
        final ObjectAnimator spin = ObjectAnimator.ofFloat(bubble.findViewById(R.id.spark), "rotation", 0f, 360f);
        spin.setDuration(1200);
        spin.setRepeatCount(ValueAnimator.INFINITE);
        spin.start();

        final String system = systemPrompt();
        final String userText = "[" + DateFormat.getDateTimeInstance(DateFormat.FULL, DateFormat.SHORT)
                .format(new Date()) + "]\n" + text;
        final StringBuilder reply = new StringBuilder();

        final ClaudeClient.Listener listener = new ClaudeClient.Listener() {
            @Override
            public void onText(final String delta) {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        reply.append(delta);
                        String shown = reply.toString().trim();
                        if (!shown.isEmpty()) {
                            statusRow.setVisibility(View.GONE);
                            body.setVisibility(View.VISIBLE);
                            body.setText(shown);
                            scrollChatToBottom();
                        }
                    }
                });
            }

            @Override
            public void onStatus(final String s) {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        statusRow.setVisibility(View.VISIBLE);
                        status.setText(s);
                    }
                });
            }

            @Override
            public void onAction(final String result) {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        TextView chip = (TextView) inflater.inflate(R.layout.item_action, actions, false);
                        chip.setText("↗  " + result);
                        actions.addView(chip);
                        scrollChatToBottom();
                    }
                });
            }
        };

        new Thread(new Runnable() {
            @Override
            public void run() {
                String error = null;
                try {
                    claude.send(apiKey, model, system, userText, LauncherActivity.this, listener);
                } catch (Exception e) {
                    error = e instanceof ClaudeClient.ApiException
                            ? e.getMessage()
                            : "Couldn't reach Claude. Check your connection and try again.";
                }
                final String shownError = error;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        busy = false;
                        spin.cancel();
                        glowPulse.cancel();
                        glow.setAlpha(0.35f);
                        if (shownError != null) {
                            statusRow.setVisibility(View.GONE);
                            body.setVisibility(View.VISIBLE);
                            body.setText(reply.length() > 0
                                    ? reply.toString().trim() + "\n\n⚠ " + shownError
                                    : "⚠ " + shownError);
                        } else if (reply.toString().trim().isEmpty()) {
                            // Only actions ran; the action chips speak for themselves.
                            statusRow.setVisibility(View.GONE);
                        }
                        buildChips();
                        updateMode();
                        scrollChatToBottom();
                    }
                });
            }
        }).start();
    }

    private void addToChat(View v) {
        v.setAlpha(0f);
        v.setTranslationY(24f);
        chatList.addView(v);
        v.animate().alpha(1f).translationY(0f).setDuration(220).start();
        scrollChatToBottom();
    }

    private void scrollChatToBottom() {
        chatScroll.post(new Runnable() {
            @Override
            public void run() {
                chatScroll.fullScroll(View.FOCUS_DOWN);
            }
        });
    }

    /** Stable across requests (apps are sorted, no timestamps) so it can be prompt-cached. */
    private String systemPrompt() {
        String name = prefs.getString(KEY_NAME, "").trim();
        String city = prefs.getString(KEY_CITY, "").trim();
        StringBuilder sb = new StringBuilder();
        sb.append("You are the assistant built into an Android home-screen launcher. The user types ")
                .append("or speaks into a single prompt bar on their home screen, so replies are read ")
                .append("at a glance: answer in one to four short sentences of plain text, no markdown, ")
                .append("no headings, no bullet symbols.\n\n")
                .append("When the user wants something done on the phone, do it with your tools rather ")
                .append("than explaining how: open_app to launch an installed app, open_url for web ")
                .append("pages, maps (geo:), the dialer (tel:), texts (sms:) or email (mailto:), ")
                .append("set_timer and set_alarm for the clock. After an action, a few words of ")
                .append("confirmation are enough. Use web_search for anything current: weather, news, ")
                .append("scores, prices, opening hours. If a request is ambiguous between apps, pick ")
                .append("the most likely one.\n\n");
        if (!name.isEmpty()) {
            sb.append("The user's name is ").append(name).append(".\n");
        }
        if (!city.isEmpty()) {
            sb.append("The user is in or near ").append(city)
                    .append("; use it for weather and anything \"near me\".\n");
        }
        sb.append("Device locale: ").append(Locale.getDefault().toString()).append("\n\n");
        sb.append("Installed apps (label — package):\n");
        for (AppEntry e : apps) {
            sb.append("- ").append(e.label).append(" — ").append(e.packageName()).append('\n');
        }
        return sb.toString();
    }

    // ---- Actions Claude can take (called on the worker thread) -------------------------------

    /** Runs {@code task} on the main thread and waits for its result. */
    private String onMain(Callable<String> task) {
        FutureTask<String> future = new FutureTask<String>(task);
        main.post(future);
        try {
            return future.get();
        } catch (Exception e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            return "Failed: " + cause.getMessage();
        }
    }

    private String start(final Intent intent, final String success, final String missing) {
        return onMain(new Callable<String>() {
            @Override
            public String call() {
                try {
                    startActivity(intent);
                    return success;
                } catch (ActivityNotFoundException e) {
                    return missing;
                }
            }
        });
    }

    @Override
    public String openApp(String packageName) {
        final AppEntry match = AppStore.findByPackage(apps, packageName);
        if (match == null) {
            return "No launchable app with package " + packageName + " is installed.";
        }
        return onMain(new Callable<String>() {
            @Override
            public String call() {
                launch(match, null);
                return "Opened " + match.label;
            }
        });
    }

    @Override
    public String openUrl(String url) {
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
        // Only schemes where the receiving app still asks the user before doing anything.
        if (!(scheme.equals("https") || scheme.equals("http") || scheme.equals("geo")
                || scheme.equals("tel") || scheme.equals("sms") || scheme.equals("smsto")
                || scheme.equals("mailto"))) {
            return "Refused: unsupported link type '" + scheme + "'.";
        }
        Intent i = new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        String what = scheme.equals("geo") ? "Opened maps"
                : scheme.equals("tel") ? "Opened the dialer"
                : scheme.startsWith("sms") ? "Opened messages"
                : scheme.equals("mailto") ? "Opened email"
                : "Opened " + (uri.getHost() == null ? url : uri.getHost());
        return start(i, what, "No app on this phone can open " + url);
    }

    @Override
    public String setTimer(int seconds, String label) {
        if (seconds <= 0 || seconds > 24 * 3600) {
            return "Timer length must be between 1 second and 24 hours.";
        }
        Intent i = new Intent(AlarmClock.ACTION_SET_TIMER)
                .putExtra(AlarmClock.EXTRA_LENGTH, seconds)
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (label != null && !label.isEmpty()) {
            i.putExtra(AlarmClock.EXTRA_MESSAGE, label);
        }
        return start(i, "Timer set for " + formatDuration(seconds),
                "No clock app on this phone supports timers.");
    }

    @Override
    public String setAlarm(int hour, int minute, String label) {
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return "Invalid time.";
        }
        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM)
                .putExtra(AlarmClock.EXTRA_HOUR, hour)
                .putExtra(AlarmClock.EXTRA_MINUTES, minute)
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (label != null && !label.isEmpty()) {
            i.putExtra(AlarmClock.EXTRA_MESSAGE, label);
        }
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, hour);
        c.set(Calendar.MINUTE, minute);
        String time = DateFormat.getTimeInstance(DateFormat.SHORT).format(c.getTime());
        return start(i, "Alarm set for " + time, "No clock app on this phone supports alarms.");
    }

    private static String formatDuration(int seconds) {
        int h = seconds / 3600;
        int m = (seconds % 3600) / 60;
        int s = seconds % 60;
        StringBuilder sb = new StringBuilder();
        if (h > 0) sb.append(h).append(" h ");
        if (m > 0) sb.append(m).append(" min ");
        if (s > 0) sb.append(s).append(" s");
        return sb.toString().trim();
    }

    // ---- Settings ---------------------------------------------------------------------------

    private void showSettings() {
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad / 2, pad, 0);

        final EditText name = field(box, R.string.name_hint, prefs.getString(KEY_NAME, ""),
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        final EditText city = field(box, R.string.city_hint, prefs.getString(KEY_CITY, ""),
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        final EditText key = field(box, R.string.api_key_hint, prefs.getString(KEY_API_KEY, ""),
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        final EditText model = field(box, R.string.model_hint, prefs.getString(KEY_MODEL, DEFAULT_MODEL),
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);

        TextView note = new TextView(this);
        note.setText(R.string.settings_note);
        note.setPadding(0, pad / 2, 0, 0);
        box.addView(note);

        new AlertDialog.Builder(this)
                .setTitle(R.string.settings)
                .setView(box)
                .setPositiveButton(R.string.save, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        prefs.edit()
                                .putString(KEY_NAME, name.getText().toString().trim())
                                .putString(KEY_CITY, city.getText().toString().trim())
                                .putString(KEY_API_KEY, key.getText().toString().trim())
                                .putString(KEY_MODEL, model.getText().toString().trim())
                                .apply();
                        updateGreeting();
                        if (!busy && (chatList.getChildCount() == 0
                                || chatList.getChildAt(0).getId() == R.id.welcome)) {
                            showWelcomeIfNeeded();
                        }
                    }
                })
                .setNeutralButton(R.string.setup_home, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        openHomeSettings();
                    }
                })
                .setNegativeButton(R.string.cancel, null)
                .show();
    }

    private EditText field(LinearLayout parent, int hint, String value, int inputType) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setSingleLine(true);
        e.setInputType(inputType);
        e.setText(value);
        parent.addView(e);
        return e;
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(prompt.getWindowToken(), 0);
        prompt.clearFocus();
    }
}
