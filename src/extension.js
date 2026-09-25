import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class TailscaleControlExtension extends Extension {
    enable() {
        this._indicator = new PanelMenu.Button(0.0, 'Tailscale Control', false);
        this._authUrl = null;

        // Custom Tailscale Symbolic SVG Icon
        const iconFile = Gio.File.new_for_path(
            GLib.build_filenamev([this.path, 'tailscale-symbolic.svg'])
        );
        const gicon = new Gio.FileIcon({ file: iconFile });

        this._icon = new St.Icon({
            gicon: gicon,
            style_class: 'system-status-icon',
            icon_size: 16,
        });
        this._indicator.add_child(this._icon);

        // Header / IP Label
        this._ipItem = new PopupMenu.PopupMenuItem('Tailscale: Checking...', { reactive: false });
        this._indicator.menu.addMenuItem(this._ipItem);

        // Backend State Label
        this._stateItem = new PopupMenu.PopupMenuItem('Backend: Unknown', { reactive: false });
        this._indicator.menu.addMenuItem(this._stateItem);

        // Dynamic Login Item (hidden when authenticated)
        this._loginItem = new PopupMenu.PopupMenuItem('Log In to Tailscale');
        this._loginItem.visible = false;
        this._loginItem.connect('activate', () => {
            this._handleLogin();
        });
        this._indicator.menu.addMenuItem(this._loginItem);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Connection Toggle Switch
        this._toggleItem = new PopupMenu.PopupSwitchMenuItem('Connection', false);
        this._toggleItem.connect('toggled', (item, state) => {
            this._runCommand(state ? ['tailscale', 'up'] : ['tailscale', 'down'], () => {
                GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                    this._refreshStatus();
                    return GLib.SOURCE_REMOVE;
                });
            });
        });
        this._indicator.menu.addMenuItem(this._toggleItem);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Refresh whenever the dropdown opens
        this._indicator.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) this._refreshStatus();
        });

        // Initial status check
        this._refreshStatus();
    }

    _runCommand(argv, callback) {
        // Resolve absolute binary path to avoid GNOME Shell spawn PATH errors
        const bin = GLib.find_program_in_path(argv[0]) || `/usr/bin/${argv[0]}`;
        const cmd = [bin, ...argv.slice(1)];

        try {
            const proc = new Gio.Subprocess({
                argv: cmd,
                flags: Gio.SubprocessFlags.STDOUT_PIPE |
                       Gio.SubprocessFlags.STDERR_PIPE |
                       Gio.SubprocessFlags.SEARCH_PATH_FROM_ENVP,
            });
            proc.init(null);
            proc.communicate_utf8_async(null, null, (proc, res) => {
                try {
                    const [, stdout, stderr] = proc.communicate_utf8_finish(res);
                    if (callback) callback(stdout, stderr);
                } catch (e) {
                    console.error(`[TailscaleControl] Error executing ${cmd.join(' ')}:`, e);
                }
            });
        } catch (e) {
            console.error(`[TailscaleControl] Subprocess launch error:`, e);
        }
    }

    _openBrowser(url) {
        try {
            Gio.AppInfo.launch_default_for_uri(url, null);
        } catch (e) {
            console.error(`[TailscaleControl] Browser launch error:`, e);
            GLib.spawn_command_line_async(`xdg-open "${url}"`);
        }
    }

    _handleLogin() {
        if (this._authUrl) {
            this._openBrowser(this._authUrl);
            return;
        }

        this._runCommand(['tailscale', 'login'], (stdout, stderr) => {
            const text = (stdout || '') + (stderr || '');
            const match = text.match(/https:\/\/login\.tailscale\.com\/a\/[a-zA-Z0-9]+/);
            if (match) {
                this._openBrowser(match[0]);
            } else {
                this._openBrowser('https://login.tailscale.com/admin');
            }
            this._refreshStatus();
        });
    }

    _refreshStatus() {
        this._runCommand(['tailscale', 'status', '--json'], (stdout) => {
            if (!stdout) return;

            try {
                const status = JSON.parse(stdout);
                const backendState = status.BackendState;
                const isRunning = backendState === 'Running';
                const needsLogin = backendState === 'NeedsLogin';

                this._authUrl = status.AuthURL || null;

                this._stateItem.label.text = `Backend: ${backendState}`;
                this._loginItem.visible = needsLogin;

                if (needsLogin) {
                    this._ipItem.label.text = 'Action Required: Log In';
                    this._toggleItem.setToggleState(false);
                    this._icon.opacity = 120;
                } else if (isRunning) {
                    const selfDevice = status.Self;
                    const ip = (selfDevice && selfDevice.TailscaleIPs && selfDevice.TailscaleIPs.length > 0)
                        ? selfDevice.TailscaleIPs[0]
                        : 'No IP';
                    this._ipItem.label.text = `IP: ${ip}`;
                    this._toggleItem.setToggleState(true);
                    this._icon.opacity = 255;
                } else {
                    this._ipItem.label.text = 'Tailscale: Offline';
                    this._toggleItem.setToggleState(false);
                    this._icon.opacity = 120;
                }
            } catch (e) {
                console.error('[TailscaleControl] JSON Parse error:', e);
            }
        });
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
