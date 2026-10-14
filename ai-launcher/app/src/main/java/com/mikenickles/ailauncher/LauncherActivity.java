package com.mikenickles.ailauncher;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.AlarmClock;
import android.provider.Settings;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.EditText;
import android.widget.GridView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Home screen: a prompt bar that searches apps as you type and asks Claude when you hit send. */
public class LauncherActivity extends Activity implements ClaudeClient.Actions {

    private static final String PREFS = "settings";
    private static final String KEY_API_KEY = "api_key";
    private static final String KEY_MODEL = "model";
    private static final String DEFAULT_MODEL = "claude-opus-5-5";

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ClaudeClient claude = new ClaudeClient();

    private AppAdapter adapter;
    private volatile List<AppEntry> apps = new ArrayList<AppEntry>();
    private EditText prompt;
    private View answerCard;
    private TextView question;
    private TextView answer;
    private View progress;
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

        prompt = (EditText) findViewById(R.id.prompt);
        answerCard = findViewById(R.id.answer_card);
        question = (TextView) findViewById(R.id.question);
        answer = (TextView) findViewById(R.id.answer);
        progress = findViewById(R.id.progress);

        adapter = new AppAdapter(getLayoutInflater());
        GridView grid = (GridView) findViewById(R.id.app_grid);
        grid.setAdapter(adapter);
        grid.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                launch(adapter.getItem(position));
            }
        });
        grid.setOnItemLongClickListener(new AdapterView.OnItemLongClickListener() {
            @Override
            public boolean onItemLongClick(AdapterView<?> parent, View view, int position, long id) {
                showAppInfo(adapter.getItem(position).packageName());
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
                    ask(prompt.getText().toString().trim());
                    return true;
                }
                return false;
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

        loadApps();
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
        // A launcher has nowhere to go back to; just clear the prompt.
        resetHome();
    }

    private void resetHome() {
        prompt.setText("");
        hideKeyboard();
        if (!busy) {
            claude.reset();
            answerCard.setVisibility(View.GONE);
        }
    }

    // ---- Apps -------------------------------------------------------------------------------

    private void loadApps() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                PackageManager pm = getPackageManager();
                Intent query = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
                List<ResolveInfo> infos = pm.queryIntentActivities(query, 0);
                final List<AppEntry> loaded = new ArrayList<AppEntry>();
                for (ResolveInfo ri : infos) {
                    if (ri.activityInfo.packageName.equals(getPackageName())) {
                        continue;
                    }
                    loaded.add(new AppEntry(
                            ri.loadLabel(pm).toString(),
                            new ComponentName(ri.activityInfo.packageName, ri.activityInfo.name),
                            ri.loadIcon(pm)));
                }
                Collections.sort(loaded, new Comparator<AppEntry>() {
                    @Override
                    public int compare(AppEntry a, AppEntry b) {
                        return a.label.compareToIgnoreCase(b.label);
                    }
                });
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        apps = loaded;
                        adapter.setApps(loaded);
                    }
                });
            }
        }).start();
    }

    private void launch(AppEntry e) {
        Intent i = new Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(e.component)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            startActivity(i);
        } catch (ActivityNotFoundException | SecurityException ex) {
            Toast.makeText(this, "Can't open " + e.label, Toast.LENGTH_SHORT).show();
        }
    }

    private void showAppInfo(String pkg) {
        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", pkg, null)));
    }

    // ---- Claude -----------------------------------------------------------------------------

    private void ask(final String text) {
        if (text.isEmpty() || busy) {
            return;
        }
        final SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        final String apiKey = prefs.getString(KEY_API_KEY, "").trim();
        final String model = prefs.getString(KEY_MODEL, DEFAULT_MODEL).trim();

        answerCard.setVisibility(View.VISIBLE);
        question.setText(text);
        if (apiKey.isEmpty()) {
            answer.setText(R.string.need_key);
            return;
        }

        busy = true;
        prompt.setText("");
        hideKeyboard();
        answer.setText(R.string.thinking);
        progress.setVisibility(View.VISIBLE);

        final String system = systemPrompt();
        final String userText = "[" + DateFormat.getDateTimeInstance(DateFormat.FULL, DateFormat.SHORT)
                .format(new Date()) + "]\n" + text;

        new Thread(new Runnable() {
            @Override
            public void run() {
                String reply;
                try {
                    reply = claude.send(apiKey, model.isEmpty() ? DEFAULT_MODEL : model,
                            system, userText, LauncherActivity.this);
                } catch (Exception e) {
                    reply = e instanceof ClaudeClient.ApiException
                            ? e.getMessage()
                            : "Couldn't reach Claude: " + e.getMessage();
                }
                final String shown = reply;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        busy = false;
                        progress.setVisibility(View.GONE);
                        answer.setText(shown);
                    }
                });
            }
        }).start();
    }

    /** Stable across requests (apps are sorted) so it can be prompt-cached. */
    private String systemPrompt() {
        StringBuilder sb = new StringBuilder();
        sb.append("You are the assistant built into an Android home-screen launcher. The user types ")
                .append("into a single prompt bar on their home screen. Keep answers short and ")
                .append("glanceable: a few sentences at most, plain text, no markdown.\n\n")
                .append("When the user wants to do something on the phone, use your tools: open_app ")
                .append("to launch an installed app, open_url for web pages, maps, the dialer, SMS or ")
                .append("email, and set_timer for timers. Use web_search for current information ")
                .append("such as news, weather, scores or opening hours. If a request is ambiguous ")
                .append("between apps, pick the most likely one.\n\n")
                .append("Installed apps (label — package):\n");
        for (AppEntry e : apps) {
            sb.append("- ").append(e.label).append(" — ").append(e.packageName()).append('\n');
        }
        sb.append("\nDevice locale: ").append(Locale.getDefault().toString());
        return sb.toString();
    }

    // ---- Actions Claude can take (called on the worker thread) -------------------------------

    @Override
    public String openApp(String packageName) {
        AppEntry match = null;
        for (AppEntry e : apps) {
            if (e.packageName().equals(packageName)) {
                match = e;
                break;
            }
        }
        if (match == null) {
            return "No launchable app with package " + packageName + " is installed.";
        }
        final AppEntry target = match;
        main.post(new Runnable() {
            @Override
            public void run() {
                launch(target);
            }
        });
        return "Opened " + match.label + ".";
    }

    @Override
    public String openUrl(String url) {
        final Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
        // Only hand off to apps for schemes that can't do anything without the user confirming.
        if (!(scheme.equals("https") || scheme.equals("http") || scheme.equals("geo")
                || scheme.equals("tel") || scheme.equals("sms") || scheme.equals("smsto")
                || scheme.equals("mailto"))) {
            return "Refused: unsupported link type '" + scheme + "'.";
        }
        final Intent i = new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (i.resolveActivity(getPackageManager()) == null) {
            return "No app on this phone can open " + url + ".";
        }
        main.post(new Runnable() {
            @Override
            public void run() {
                startActivity(i);
            }
        });
        return "Opened " + url + ".";
    }

    @Override
    public String setTimer(int seconds, String label) {
        if (seconds <= 0 || seconds > 24 * 3600) {
            return "Timer length must be between 1 second and 24 hours.";
        }
        final Intent i = new Intent(AlarmClock.ACTION_SET_TIMER)
                .putExtra(AlarmClock.EXTRA_LENGTH, seconds)
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (label != null && !label.isEmpty()) {
            i.putExtra(AlarmClock.EXTRA_MESSAGE, label);
        }
        if (i.resolveActivity(getPackageManager()) == null) {
            return "No clock app on this phone supports timers.";
        }
        main.post(new Runnable() {
            @Override
            public void run() {
                startActivity(i);
            }
        });
        return "Timer set for " + formatDuration(seconds) + ".";
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
        final SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad / 2, pad, 0);

        final EditText key = new EditText(this);
        key.setHint(R.string.api_key_hint);
        key.setSingleLine(true);
        key.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        key.setText(prefs.getString(KEY_API_KEY, ""));
        box.addView(key);

        final EditText model = new EditText(this);
        model.setHint(R.string.model_hint);
        model.setSingleLine(true);
        model.setText(prefs.getString(KEY_MODEL, DEFAULT_MODEL));
        box.addView(model);

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
                                .putString(KEY_API_KEY, key.getText().toString().trim())
                                .putString(KEY_MODEL, model.getText().toString().trim())
                                .apply();
                    }
                })
                .setNegativeButton(R.string.cancel, null)
                .show();
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(prompt.getWindowToken(), 0);
        prompt.clearFocus();
    }
}
