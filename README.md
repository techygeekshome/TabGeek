# TabGeek: Tab Suspender

Free up memory by putting tabs you have not used for a while to sleep. Sleeping tabs stay in your tab bar with their title and icon, and load again the moment you click them.

**Download and full guide:** https://techygeekshome.info/browser-extensions/tabgeek/

## What it does

- **Sleeps unused tabs** after 5, 15 or 30 minutes, 1, 2 or 6 hours, or a day without use. Or turn automatic sleep off and only sleep tabs when you ask.
- **Uses the browser's own tab sleeping** (`tabs.discard`). The page is not swapped for a placeholder, so your tabs, history and bookmarks keep the real address.
- **Keeps the right tabs awake**: pinned tabs, tabs playing sound, the tab you are looking at, and (if you allow it) tabs with typing that is not saved yet.
- **Sites that never sleep**: add a site from the menu or the settings page. A site covers its subdomains too.
- **Keep this tab awake** until you close it.
- **Sleep this tab** and **Sleep other tabs** buttons, plus **Wake all tabs**.
- **See how many tabs are asleep** in the menu, with a list you can click to open one.
- **Keyboard shortcuts**: `Alt+Shift+S` puts this tab to sleep, `Alt+Shift+O` puts the other tabs in the window to sleep. You can change them, and add one for waking all tabs, in your browser's shortcut settings.

## What it won't do

- It does not save the contents of a sleeping page. A page reloads from the website when you wake it, so anything not saved on the site (like a half-written form) can be lost. Turn on **Tabs with typing that is not saved** to keep those awake.
- It cannot sleep the tab you are looking at without moving you to another tab first. **Sleep this tab** does that for you. If it is the only tab in the window, TabGeek leaves it alone.
- It does not measure memory. Browsers do not let extensions see how much memory each tab uses.

## Install

Pick the download for your browser from the [latest release](https://github.com/techygeekshome/TabGeek/releases/latest).

| Browser | Download |
|---|---|
| Chrome, Brave, Opera, Vivaldi | `TabGeek-chrome.zip` |
| Microsoft Edge | `TabGeek-edge.zip` |
| Firefox (142 or newer) | `TabGeek-firefox.zip` |

`TabGeek.zip` is the same package as the Chrome and Edge downloads.

### Chrome, Edge, Brave, Opera and Vivaldi

1. Unzip the download somewhere you'll keep it.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the `tabgeek` folder.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and pick `TabGeek-firefox.zip`.

Firefox removes temporary add-ons when it closes.

### Build it yourself

The code in this repo is the Chromium version. `manifest.firefox.json` is the Firefox manifest. Run `./build.sh` to make every package in `dist/`.

## Use

1. Install it. From now on, tabs you leave alone for 30 minutes go to sleep.
2. Click the TabGeek icon to see how many tabs are asleep, change the time, or sleep tabs straight away.
3. Tick **Never put this site to sleep** on sites you always want ready, such as your email or music player.
4. Open **Settings** for the full list of sites, the keep-awake options and your shortcuts.

## How it works

- `background.js` notes the moment you switch away from each tab. Once a minute (using the browser's `alarms`) it puts to sleep any tab you have not used for longer than your chosen time, unless one of your keep-awake rules applies.
- Sleeping uses `tabs.discard`, built into Chrome, Edge and Firefox. The browser frees the page's memory and keeps the tab.
- The unsaved typing check only runs if you turn it on and allow access to websites. Just before a tab goes to sleep, TabGeek checks whether any form box on the page has been changed. Nothing is read or kept apart from that yes or no.

## Privacy

TabGeek has no account, no analytics and sends nothing anywhere. It never loads anything from the web itself. Your settings and site list are stored on your own computer, and the "last used" times are kept in memory only until the browser closes.

## Licence

GPL-3.0. Free for everyone, including commercial use.

TabGeek is an independent tool made by [TechyGeeksHome](https://techygeekshome.info).
