# MedCamp Pro Server

This is the backend server for the MedCamp Pro application, built with Node.js, Express, and MongoDB. It provides RESTful APIs for managing users and medical camps.

## Features
- User management (registration, login, last login update)
- Camp management (create, list, details)
- CORS support for frontend integration
- Environment variable configuration

## Getting Started

### Prerequisites
- Node.js
- MongoDB database

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```env
   PORT=3000
   DB_URI=your_mongodb_connection_string
   ```
4. Start the server:
   ```bash
   node index.js
   ```

## API Endpoints

### Users
- `GET /users` - Get all users
- `GET /users/:email` - Get user by email
- `POST /users` - Register a new user
- `PATCH /users/last-login/:email` - Update user's last login time

### Camps
- `GET /camps` - Get all camps
- `GET /camp-details/:id` - Get camp details by ID
- `POST /camp` - Create a new camp

## Deployment
This server can be deployed on platforms like Vercel. See `vercel.json` for configuration.

## License
MIT
