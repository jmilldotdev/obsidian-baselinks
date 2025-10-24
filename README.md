# Baselinks for Obsidian

Automatically display Obsidian base views in your right sidebar based on the current note's frontmatter properties.

## Features

- **Automatic base views**: Displays base files in the right sidebar based on frontmatter properties
- **View navigation**: Opens to specific views within base files using the `#` syntax
- **Multiple bases**: Stack multiple base views vertically in the sidebar
- **Default bases**: Configure fallback bases to show when no property is found
- **Focus preservation**: Keeps focus on your editor when switching notes

## Usage

### Basic Setup

Add a `baselinks` property to any note's frontmatter:

```yaml
---
baselinks:
  - "[[tasks.base#In-Progress]]"
  - "[[projects.base#Active]]"
---
```

When you open that note, the plugin will automatically:
1. Open the specified base files in the right sidebar
2. Navigate to the specified views (e.g., "In-Progress", "Active")
3. Stack them vertically for easy reference

### Link Format

Base links follow this format:
- `[[filename.base]]` - Opens the base with its default view
- `[[filename.base#ViewName]]` - Opens the base to a specific view

### Single Baselink

For a single baselink, you can use either format:

```yaml
---
baselinks: "[[all-notes.base]]"
---
```

or

```yaml
---
baselinks:
  - "[[all-notes.base]]"
---
```

## Settings

### Baselink Property Name
**Default:** `baselinks`

Customize the frontmatter property name the plugin reads. For example, change it to `sidebar` or `views`.

### Default Baselinks
Specify base links to display when a note has no baselinks property. Add one link per line:

```
[[all-notes.base]]
[[tasks.base#Today]]
```

These default bases will appear in the sidebar for any note without its own baselinks property.

## Installation

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css`
2. Copy them to `VaultFolder/.obsidian/plugins/obsidian-baselinks/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

### Development

```bash
npm install
npm run dev
```

## License

MIT
