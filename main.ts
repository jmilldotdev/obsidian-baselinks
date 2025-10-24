import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
	OpenViewState,
	ItemView
} from 'obsidian';

interface BaselinksSettings {
	baselinkPropertyName: string;
	defaultBaselinks: string[];
}

const DEFAULT_SETTINGS: BaselinksSettings = {
	baselinkPropertyName: 'baselinks',
	defaultBaselinks: []
}

const BASELINKS_LEAF_ID = 'baselinks-managed-leaf';

export default class BaselinksPlugin extends Plugin {
	settings: BaselinksSettings;
	private managedLeaves: WorkspaceLeaf[] = [];
	private updateTimeout: NodeJS.Timeout | null = null;
	private isUpdating = false;
	private currentBaselinks: string[] = [];

	async onload() {
		await this.loadSettings();

		// Hook into file-open to see what state is used when clicking links
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file && file.extension === 'base') {
					setTimeout(() => {
						const activeLeaf = this.app.workspace.getActiveViewOfType(ItemView)?.leaf;
						if (activeLeaf) {
							const state = (activeLeaf as any).getViewState();
							const view = (activeLeaf as any).view;
						}
					}, 100);
				}
			})
		);

		// Register event handlers with proper cleanup
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.scheduleUpdate();
			})
		);

		this.registerEvent(
			this.app.metadataCache.on('changed', () => {
				this.scheduleUpdate();
			})
		);

		// Add settings tab
		this.addSettingTab(new BaselinksSettingTab(this.app, this));

		// Initial update when workspace is ready
		this.app.workspace.onLayoutReady(() => {
			this.updateBaselinks();
		});
	}

	onunload() {
		// Clean up all managed leaves
		this.clearManagedLeaves();
	}

	private scheduleUpdate() {
		// Check if the active leaf is one of our managed leaves - if so, ignore
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf && this.managedLeaves.includes(activeLeaf)) {
			return;
		}

		// If already updating, don't schedule - the current update will handle it
		if (this.isUpdating) {
			return;
		}

		// Debounce: clear existing timeout and set a new one
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}

		this.updateTimeout = setTimeout(() => {
			this.updateTimeout = null;
			this.updateBaselinks();
		}, 50);
	}

	private clearManagedLeaves() {
		for (const leaf of this.managedLeaves) {
			leaf.detach();
		}
		this.managedLeaves = [];
	}

	private async updateBaselinks() {

		if (this.isUpdating) {
			return;
		}

		this.isUpdating = true;

		// Store the currently active leaf to restore focus later
		const originalActiveLeaf = this.app.workspace.activeLeaf;

		try {
			const activeFile = this.app.workspace.getActiveFile();

			let baselinks: string[] = [];

			if (activeFile) {
				baselinks = this.getBaselinksFromFile(activeFile);
			}

			// Use default baselinks if none found
			if (baselinks.length === 0) {
				baselinks = this.settings.defaultBaselinks;
			}


			// Check if baselinks actually changed
			if (this.arraysEqual(this.currentBaselinks, baselinks)) {
				return;
			}

			// Update current baselinks
			this.currentBaselinks = [...baselinks];

			// Clear existing managed leaves
			this.clearManagedLeaves();

			if (baselinks.length === 0) {
				return;
			}

			// Get or create leaves in the right sidebar
			let previousLeaf: WorkspaceLeaf | null = null;

			for (let i = 0; i < baselinks.length; i++) {
				const link = baselinks[i];

				// Parse the link
				const linkMatch = link.match(/\[\[([^\]]+)\]\]/);
				if (!linkMatch) {
					continue;
				}

				const linkPath = linkMatch[1];

				// Parse the file path and subpath (e.g., "tasks.base#In-Progress")
				const [filePath, subpath] = linkPath.split('#');

				// Get the file
				const file = this.app.metadataCache.getFirstLinkpathDest(filePath, '');
				if (!file) {
					continue;
				}


				let leaf: WorkspaceLeaf | null;

				if (i === 0) {
					// First baselink: get a leaf in the right sidebar
					leaf = this.app.workspace.getRightLeaf(false);
				} else {
					// Subsequent baselinks: split vertically from the previous leaf
					const parent = previousLeaf!.parent;

					if (!parent) {
						leaf = this.app.workspace.getRightLeaf(false);
					} else {
						// Create a horizontal split (which stacks vertically in Obsidian)
						// Obsidian's naming is counterintuitive: 'horizontal' = stacked vertically
						leaf = this.app.workspace.createLeafBySplit(parent as WorkspaceLeaf, 'horizontal');
					}
				}

				if (!leaf) {
					continue;
				}

				this.managedLeaves.push(leaf);
				previousLeaf = leaf;

				// Open the file with proper state for subpath

				const openState: OpenViewState = {};

				if (subpath) {
					// For base files, pass viewName in state
					openState.state = { viewName: subpath };
				}

				await leaf.openFile(file, openState);

				// Reveal the first leaf (but don't focus it)
				if (i === 0) {
					this.app.workspace.revealLeaf(leaf);
				}
			}

			// Restore focus to the original active leaf
			if (originalActiveLeaf && !this.managedLeaves.includes(originalActiveLeaf)) {
				this.app.workspace.setActiveLeaf(originalActiveLeaf, { focus: true });
			}
		} finally {
			this.isUpdating = false;
		}
	}

	private arraysEqual(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}

	private getBaselinksFromFile(file: TFile): string[] {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) {
			return [];
		}

		const propertyValue = cache.frontmatter[this.settings.baselinkPropertyName];

		if (!propertyValue) {
			return [];
		}

		// Handle both string and array values
		if (Array.isArray(propertyValue)) {
			const result = propertyValue.filter(v => typeof v === 'string');
			return result;
		} else if (typeof propertyValue === 'string') {
			return [propertyValue];
		}

		return [];
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update baselinks when settings change
		this.scheduleUpdate();
	}
}

class BaselinksSettingTab extends PluginSettingTab {
	plugin: BaselinksPlugin;

	constructor(app: App, plugin: BaselinksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Baselinks Settings'});

		new Setting(containerEl)
			.setName('Baselink Property Name')
			.setDesc('The name of the frontmatter property to read baselinks from')
			.addText(text => text
				.setPlaceholder('baselinks')
				.setValue(this.plugin.settings.baselinkPropertyName)
				.onChange(async (value) => {
					this.plugin.settings.baselinkPropertyName = value || 'baselinks';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Baselinks')
			.setDesc('Default baselinks to show when no property is found (one per line)')
			.addTextArea(text => text
				.setPlaceholder('[[view.base#view-name]]\n[[another.base#view]]')
				.setValue(this.plugin.settings.defaultBaselinks.join('\n'))
				.onChange(async (value) => {
					this.plugin.settings.defaultBaselinks = value
						.split('\n')
						.map(line => line.trim())
						.filter(line => line.length > 0);
					await this.plugin.saveSettings();
				}));
	}
}
