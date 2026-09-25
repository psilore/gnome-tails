UUID = tailscale-control@local
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SRC_DIR = src

.PHONY: all dev install pack clean enable disable reload-help

all: install

# Symlink source directly for rapid live development
dev: clean
	@mkdir -p $(HOME)/.local/share/gnome-shell/extensions
	ln -s $(CURDIR)/$(SRC_DIR) $(EXT_DIR)
	@echo "Symlinked $(SRC_DIR) -> $(EXT_DIR)"
	@$(MAKE) enable

# Build clean zip and install via native gnome-extensions CLI
install: pack
	gnome-extensions install --force $(UUID).zip
	@$(MAKE) enable

# Pack standard extension bundle
pack:
	gnome-extensions pack $(SRC_DIR) --force --out-dir=.

# Enable the extension in GNOME Shell
enable:
	gnome-extensions enable $(UUID) || true

# Disable the extension
disable:
	gnome-extensions disable $(UUID) || true

# Remove installed/symlinked extension
clean:
	@rm -f $(UUID).zip
	@if [ -L "$(EXT_DIR)" ]; then \
		rm -f "$(EXT_DIR)"; \
		echo "Removed symlink $(EXT_DIR)"; \
	elif [ -d "$(EXT_DIR)" ]; then \
		rm -rf "$(EXT_DIR)"; \
		echo "Removed directory $(EXT_DIR)"; \
	fi

reload-help:
	@echo "Wayland: Log out and log back in to reload GNOME Shell."
	@echo "X11: Alt+F2, type 'r', press Enter."
	@echo "Logs: journalctl -f -o cat /usr/bin/gnome-shell"
