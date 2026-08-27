# Postman Collection Setup Guide

## Quick Start

1. **Export your Postman collection:**
   - Open Postman
   - Select your collection
   - Click the three dots (⋯) → Export
   - Choose "Collection v2.1" format
   - Save the JSON file

2. **Add to the project:**
   - Rename the exported file to `collection.json`
   - Place it in the root directory: `C:\xampp\htdocs\api_collection\collection.json`

3. **View your collection:**
   - Open: `http://localhost/api_collection/`
   - Your collection will load automatically!

## Collection Structure Support

The application supports:

✅ **Nested Folders** - Folders within folders (any depth)  
✅ **Multiple Endpoints** - Any number of API endpoints  
✅ **All HTTP Methods** - GET, POST, PUT, DELETE, PATCH, etc.  
✅ **Request Details** - Headers, body, query parameters  
✅ **Response Examples** - Multiple response examples per endpoint  
✅ **Authentication** - API keys, Bearer tokens, etc.  
✅ **Variables** - Collection variables (e.g., baseUrl)  

## Collection Format

Your Postman collection should follow the standard v2.1 format:

```json
{
  "info": {
    "name": "Your Collection Name",
    "description": "Collection description",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
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
            "header": [],
            "url": {
              "raw": "{{baseUrl}}/endpoint",
              "host": ["{{baseUrl}}"],
              "path": ["endpoint"]
            }
          }
        }
      ]
    }
  ]
}
```

## Features

### Tree Navigation
- **Expandable Folders**: Click folder headers to expand/collapse
- **Method Badges**: Color-coded HTTP method badges (GET, POST, etc.)
- **Search**: Use the search bar to quickly find endpoints
- **Active Highlighting**: Selected endpoint is highlighted in blue

### Endpoint Details
- **Full Documentation**: View all endpoint details
- **Request Parameters**: Query params, headers, body
- **Response Examples**: See example responses
- **Authentication Info**: View auth requirements

### API Explorer
- **Test Endpoints**: Send requests directly from the interface
- **Edit Request Body**: Modify JSON before sending
- **View Responses**: See response status and body
- **Auth Input**: Enter API keys/tokens

### Sharing
- **Download Collection**: Users can download the Postman collection
- **Shareable Links**: Share via URL with `?collection=URL`
- **Direct Endpoint Links**: Link to specific endpoints

## Tips

1. **Organize with Folders**: Group related endpoints in folders for better navigation
2. **Add Descriptions**: Include descriptions in your requests for better documentation
3. **Use Variables**: Set up collection variables for base URLs
4. **Add Examples**: Include response examples for better documentation
5. **Name Clearly**: Use clear, descriptive names for endpoints and folders

## Troubleshooting

**Collection not loading?**
- Check that `collection.json` is in the root directory
- Verify the JSON is valid (use a JSON validator)
- Check browser console for errors

**Endpoints not showing?**
- Ensure endpoints have a `request` object
- Check that folders have an `item` array
- Verify the collection structure matches Postman v2.1 format

**Tree not expanding?**
- Click the chevron icon or folder name
- Check browser console for JavaScript errors
- Try refreshing the page

## Next Steps

Once your collection is loaded, you can:
1. Click any endpoint to view its details
2. Use the API Explorer to test endpoints
3. Share the link with your team
4. Let users download the collection

Ready to start documenting your APIs! 🚀
