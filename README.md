# Takaful Oman Insurance - API Collection Viewer

A modern, interactive API documentation viewer for sharing Postman collections. Built specifically for Takaful Oman Insurance SAOG.

## Features

- 📚 **Three-Column Layout**: Sidebar navigation, main content area, and API explorer
- 🎨 **Dark Theme**: Modern Postman-inspired dark theme
- 🔍 **Search Functionality**: Quickly find APIs in large collections
- 📥 **Download Collections**: Users can download the Postman collection directly
- 🧪 **API Testing**: Built-in API explorer to test endpoints
- 🔗 **Shareable Links**: Share collections via URL parameters
- 📱 **Responsive Design**: Works on different screen sizes

## Usage

### Option 1: Local Collection File

1. Place your Postman collection JSON file as `collection.json` in the root directory
2. Open `index.html` in a web browser
3. The collection will load automatically

### Option 2: Remote Collection URL

1. Share the link with the collection parameter:
   ```
   https://your-domain.com/api_collection/?collection=https://example.com/collection.json
   ```

2. Users can access the collection directly via the link

### Option 3: Specific Endpoint

You can also link directly to a specific endpoint:
```
https://your-domain.com/api_collection/?collection=https://example.com/collection.json&endpoint=0
```

## Adding Your Logo

1. Place your Takaful Oman Insurance logo as `logo.png` in the root directory
2. Supported formats: PNG, JPG, SVG
3. Recommended size: 200x60 pixels (or similar aspect ratio)
4. If no logo is found, the text "Takaful Oman Insurance SAOG" will be displayed

## Postman Collection Format

The application supports standard Postman Collection v2.1 format. Your collection should include:

- `info`: Collection metadata (name, description, version)
- `item`: Array of folders and requests
- `variable`: Collection variables (e.g., baseUrl)

### Example Structure

```json
{
  "info": {
    "name": "My API Collection",
    "description": "Collection description"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "https://api.example.com"
    }
  ],
  "item": [
    {
      "name": "Folder Name",
      "item": [
        {
          "name": "Endpoint Name",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/endpoint"
          }
        }
      ]
    }
  ]
}
```

## Customization

### Colors

Edit `styles.css` and modify the CSS variables in `:root`:

```css
:root {
    --bg-primary: #1e1e1e;
    --accent-blue: #0070f3;
    /* ... other variables */
}
```

### Branding

- Logo: Replace `logo.png`
- Company name: Edit the logo text in `index.html`
- Footer: Modify the "Powered by" text in `index.html`

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Edge (latest)
- Safari (latest)

## File Structure

```
api_collection/
├── index.html          # Main HTML file
├── styles.css          # All styling
├── app.js              # Application logic
├── collection.json     # Sample Postman collection
├── logo.png           # Company logo (add your own)
└── README.md          # This file
```

## Development

To run locally:

1. Use a local web server (XAMPP, WAMP, or Python's http.server)
2. Navigate to the directory in your browser
3. For XAMPP: `http://localhost/api_collection/`

## License

© 2024 Takaful Oman Insurance SAOG. All rights reserved.
