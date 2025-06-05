# Topic View Count Control

A Discourse plugin that allows administrators and staff to set custom view counts for topics, overriding the default display with fake view counts while hiding the original view counts through CSS.

## Features

- **Custom View Counts**: Set custom view counts for any topic
- **Admin/Staff Control**: Only administrators and optionally staff members can modify view counts
- **Hide Original Counts**: CSS-based hiding of original view counts when custom counts are enabled
- **Multiple Interfaces**: Edit view counts from both topic pages and topic lists
- **Real-time Updates**: Changes are applied immediately without page refresh
- **Multilingual Support**: Includes English and Chinese localizations

## Installation

1. Add the plugin repository to your `app.yml` file:

```yaml
hooks:
  after_code:
    - exec:
        cd: $home/plugins
        cmd:
          - git clone https://github.com/your-repo/topic-view-count-control.git
```

2. Rebuild your Discourse container:

```bash
cd /var/discourse
./launcher rebuild app
```

3. Enable the plugin in Admin → Plugins → Settings:
   - Check "topic view count control enabled"
   - Optionally enable "view count staff only" to allow staff members to edit counts
   - Optionally enable "view count hide original" to hide original view counts

## Usage

### For Administrators

Once installed, administrators will see edit buttons next to topics that allow them to:
- Set custom view counts for individual topics
- Enable/disable custom view count display
- The original view counts will be hidden automatically when custom counts are active

### Settings

- **topic_view_count_control_enabled**: Enable the plugin site-wide
- **view_count_hide_original**: Hide original view counts when custom counts are enabled
- **view_count_staff_only**: Allow staff members (not just admins) to modify view counts

### Locations

The plugin adds edit controls in multiple locations:
- **Topic List**: Small edit buttons next to topic titles
- **Topic Page**: Edit button above the post stream
- **Inline Editing**: Quick edit functionality for fast changes

## Technical Details

- Custom view counts are stored in topic custom fields
- Original view counts are hidden via CSS when custom counts are enabled
- Real-time updates using AJAX requests
- Compatible with Discourse's topic list and topic view serializers

## Permissions

- **Administrators**: Always have full access to edit view counts
- **Staff**: Can edit view counts if the "view_count_staff_only" setting is enabled
- **Regular Users**: Cannot see or modify view count controls

## API

The plugin tracks two custom fields per topic:
- `custom_view_count`: The custom view count number (integer)
- `use_custom_view_count`: Boolean flag to enable/disable custom count display

## Compatibility

- Discourse version 2.8+ (uses plugin API 0.8.31)
- Works with default Discourse themes
- CSS rules for hiding original counts are applied globally when enabled 