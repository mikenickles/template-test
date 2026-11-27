# AI Keyboard (Android)

An Android keyboard with Claude built in. As you type, it reads the text in the field, finds your
typing mistakes, and offers a one-tap **Fix**. You can give it a list of mistakes you usually make
(in plain words), and it watches for those especially.

## How it works

- **QWERTY keyboard** with shift/caps lock, a symbols layer, and backspace you can hold down to repeat.
- **Suggestion strip** above the keys:
  - after you finish a word or sentence and pause briefly, the keyboard sends the text before the
    cursor (up to 1,500 characters) to Claude;
  - if Claude finds mistakes, the strip shows them (`teh → the   dont → don't`) with a **Fix** button;
  - **✨** checks right away; **✕** dismisses a suggestion; **⚙** opens settings.
- **Your common mistakes**: in settings, write things like *"I type 'teh' for 'the'"* or *"I mix up
  your/you're"*. These go into Claude's instructions on every check.
- **Only typos are fixed**: Claude is told to leave your wording, slang, shorthand and emoji alone,
  and not to touch a word you're still typing.
- If you keep typing while a check is running, the fix is still applied to the right spot, and only
  the changed part of the text is replaced.

## Privacy

What you type in normal text fields is sent to Anthropic's API to be checked. These are **never sent**:
password fields, number/phone fields, and fields that ask keyboards not to learn from them
(`IME_FLAG_NO_PERSONALIZED_LEARNING`, used by incognito tabs and similar). Your API key is stored in
the app's private storage on the phone.

## Setup

1. Build and install the app (below).
2. Open **AI Keyboard**, tap **Enable AI Keyboard in system settings**, and turn it on.
3. Tap **Switch to AI Keyboard**.
4. Paste a Claude API key (from platform.claude.com → API keys).
5. Write the mistakes you usually make, then type in the "Try it here" box.

### Settings

| Setting | Default | |
|---|---|---|
| Check automatically as I type | on | Off = only checks when you tap ✨ |
| Apply fixes automatically | off | On = fixes are applied without tapping Fix |
| Model | Claude Opus 5.5 | Haiku 5.5 is faster and much cheaper, which suits a keyboard well; Opus is the most accurate |

## Building

You need JDK 17+ and the Android SDK (platform 35). With Android Studio, open this `ai-keyboard`
folder and press Run. From the command line:

```bash
cd ai-keyboard
echo "sdk.dir=/path/to/Android/sdk" > local.properties   # if ANDROID_HOME isn't set
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Code layout

| File | What it does |
|---|---|
| `AiKeyboardService.kt` | The input method: handles keys, decides when to check, applies fixes |
| `KeyboardView.kt` | The keyboard and suggestion strip UI (built in code) |
| `Corrector.kt` | Calls Claude through the official Anthropic Java SDK and returns structured fixes |
| `SettingsActivity.kt` | Setup, API key, common mistakes, options |
| `Prefs.kt` | Saved settings |

Claude is called with low effort and a JSON output schema (`corrected` text plus a list of
`changes`), so each answer can be read directly. On Opus/Sonnet, server-side fallbacks are enabled,
so a request a safety classifier declines is retried on a fallback model.
