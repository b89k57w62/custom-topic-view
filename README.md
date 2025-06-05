# Topic View Count Control

A Discourse plugin that allows admin and staff to set custom view counts for topics, overriding the default display with fake view counts while hiding the original view counts through CSS.


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