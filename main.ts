import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf
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

		// Register event handlers with proper cleanup
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.scheduleUpdate();
			})
		);

		this.registerEvent(
			this.app.workspace.on('file-open', () => {
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
						// Create a vertical split (stacked) by passing 'vertical' direction
						// We need to cast parent to any because TypeScript doesn't know the exact type
						leaf = this.app.workspace.createLeafBySplit(parent as any, 'vertical' as any);
						console.log('DBGCLEAN9X7: created vertical split leaf');
					}
				}

				if (!leaf) {
					console.log('DBGCLEAN9X7: could not create leaf');
					continue;
				}

				this.managedLeaves.push(leaf);
				previousLeaf = leaf;

				// Open the file
				console.log('DBGCLEAN9X7: opening file:', file.path, 'subpath:', subpath);

				if (subpath) {
					// For base files, try to set the active view after opening
					await leaf.openFile(file);

					// After opening, try to set the subpath via the view state
					const view = leaf.view;
					console.log('DBGCLEAN9X7: view after opening:', view);

					if (view && 'setState' in view && typeof view.setState === 'function') {
						console.log('DBGCLEAN9X7: trying to set view state with subpath:', subpath);
						try {
							await (view as any).setState({ subpath: subpath }, {});
						} catch (e) {
							console.log('DBGCLEAN9X7: setState failed:', e);
						}
					}
				} else {
					await leaf.openFile(file);
				}

				// Reveal the first leaf
				if (i === 0) {
					this.app.workspace.revealLeaf(leaf);
				}
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
