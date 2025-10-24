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
	private updateScheduled = false;
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
							console.log('DBGCLEAN9X7: file-open event for base file:', file.path);
							console.log('DBGCLEAN9X7: leaf view state:', JSON.stringify(state, null, 2));
							console.log('DBGCLEAN9X7: leaf.view:', view);
							console.log('DBGCLEAN9X7: leaf.view.getState():', view?.getState ? view.getState() : 'no getState');
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
		// Prevent updates while we're already updating
		if (this.isUpdating || this.updateScheduled) {
			console.log('DBGCLEAN9X7: skipping scheduleUpdate - already updating or scheduled');
			return;
		}

		// Check if the active leaf is one of our managed leaves - if so, ignore
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf && this.managedLeaves.includes(activeLeaf)) {
			console.log('DBGCLEAN9X7: skipping scheduleUpdate - active leaf is a managed baselink leaf');
			return;
		}

		this.updateScheduled = true;
		setTimeout(() => {
			this.updateScheduled = false;
			this.updateBaselinks();
		}, 100);
	}

	private clearManagedLeaves() {
		console.log('DBGCLEAN9X7: clearing', this.managedLeaves.length, 'managed leaves');
		for (const leaf of this.managedLeaves) {
			leaf.detach();
		}
		this.managedLeaves = [];
	}

	private async updateBaselinks() {
		console.log('DBGCLEAN9X7: updateBaselinks called');

		if (this.isUpdating) {
			console.log('DBGCLEAN9X7: already updating, skipping');
			return;
		}

		this.isUpdating = true;

		try {
			const activeFile = this.app.workspace.getActiveFile();
			console.log('DBGCLEAN9X7: activeFile:', activeFile?.path);

			let baselinks: string[] = [];

			if (activeFile) {
				baselinks = this.getBaselinksFromFile(activeFile);
			}

			// Use default baselinks if none found
			if (baselinks.length === 0) {
				console.log('DBGCLEAN9X7: using default baselinks:', this.settings.defaultBaselinks);
				baselinks = this.settings.defaultBaselinks;
			}

			console.log('DBGCLEAN9X7: baselinks to display:', baselinks);

			// Check if baselinks actually changed
			if (this.arraysEqual(this.currentBaselinks, baselinks)) {
				console.log('DBGCLEAN9X7: baselinks unchanged, skipping update');
				return;
			}

			// Update current baselinks
			this.currentBaselinks = [...baselinks];

			// Clear existing managed leaves
			this.clearManagedLeaves();

			if (baselinks.length === 0) {
				console.log('DBGCLEAN9X7: no baselinks to display');
				return;
			}

			// Get or create leaves in the right sidebar
			let previousLeaf: WorkspaceLeaf | null = null;

			for (let i = 0; i < baselinks.length; i++) {
				const link = baselinks[i];
				console.log('DBGCLEAN9X7: opening link:', link);

				// Parse the link
				const linkMatch = link.match(/\[\[([^\]]+)\]\]/);
				if (!linkMatch) {
					console.log('DBGCLEAN9X7: invalid link format:', link);
					continue;
				}

				const linkPath = linkMatch[1];
				console.log('DBGCLEAN9X7: parsed link path:', linkPath);

				// Parse the file path and subpath (e.g., "tasks.base#In-Progress")
				const [filePath, subpath] = linkPath.split('#');

				// Get the file
				const file = this.app.metadataCache.getFirstLinkpathDest(filePath, '');
				if (!file) {
					console.log('DBGCLEAN9X7: file not found:', filePath);
					continue;
				}

				console.log('DBGCLEAN9X7: found file:', file.path, 'subpath:', subpath);

				let leaf: WorkspaceLeaf | null;

				if (i === 0) {
					// First baselink: get a leaf in the right sidebar
					leaf = this.app.workspace.getRightLeaf(false);
					console.log('DBGCLEAN9X7: got first right leaf');
				} else {
					// Subsequent baselinks: split vertically from the previous leaf
					const parent = previousLeaf!.parent;
					console.log('DBGCLEAN9X7: splitting from parent:', parent);

					if (!parent) {
						console.log('DBGCLEAN9X7: no parent, using getRightLeaf');
						leaf = this.app.workspace.getRightLeaf(false);
					} else {
						// Create a horizontal split (which stacks vertically in Obsidian)
						// Obsidian's naming is counterintuitive: 'horizontal' = stacked vertically
						leaf = this.app.workspace.createLeafBySplit(parent as WorkspaceLeaf, 'horizontal');
						console.log('DBGCLEAN9X7: created horizontal split leaf (stacked)');
					}
				}

				if (!leaf) {
					console.log('DBGCLEAN9X7: could not create leaf');
					continue;
				}

				this.managedLeaves.push(leaf);
				previousLeaf = leaf;

				// Open the file with proper state for subpath
				console.log('DBGCLEAN9X7: opening file:', file.path, 'with subpath:', subpath);

				const openState: OpenViewState = {};

				if (subpath) {
					// For base files, pass viewName in state
					openState.state = { viewName: subpath };
				}

				console.log('DBGCLEAN9X7: openFile with state:', openState);
				await leaf.openFile(file, openState);
				console.log('DBGCLEAN9X7: openFile completed');

				// Reveal the first leaf
				if (i === 0) {
					this.app.workspace.revealLeaf(leaf);
				}
			}
		} finally {
			// Add a cooldown period after updating to let all async operations settle
			setTimeout(() => {
				this.isUpdating = false;
				console.log('DBGCLEAN9X7: isUpdating set to false after cooldown');
			}, 200);
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
		console.log('DBGCLEAN9X7: getBaselinksFromFile for:', file.path);
		const cache = this.app.metadataCache.getFileCache(file);
		console.log('DBGCLEAN9X7: cache frontmatter:', cache?.frontmatter);
		if (!cache?.frontmatter) {
			console.log('DBGCLEAN9X7: no frontmatter found');
			return [];
		}

		const propertyValue = cache.frontmatter[this.settings.baselinkPropertyName];
		console.log('DBGCLEAN9X7: property', this.settings.baselinkPropertyName, '=', propertyValue);

		if (!propertyValue) {
			console.log('DBGCLEAN9X7: property value is empty');
			return [];
		}

		// Handle both string and array values
		if (Array.isArray(propertyValue)) {
			const result = propertyValue.filter(v => typeof v === 'string');
			console.log('DBGCLEAN9X7: returning array:', result);
			return result;
		} else if (typeof propertyValue === 'string') {
			console.log('DBGCLEAN9X7: returning single string:', [propertyValue]);
			return [propertyValue];
		}

		console.log('DBGCLEAN9X7: property value is not string or array');
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
