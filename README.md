# MedCamp Pro Server

This is the backend server for the MedCamp Pro application, built with Node.js, Express, MongoDB, and Firebase Admin. It provides RESTful APIs for managing users, medical camps, registrations, payments, and feedback.

## Features
- User management (registration, login, last login update, role-based access)
- Camp management (create, list, search, filter, details, update, delete)
- Registration and payment system (Stripe integration)
- Feedback and contact message collection
- CORS support for frontend integration
- Firebase authentication and role verification middleware
- Environment variable configuration

## Getting Started

### Prerequisites
- Node.js
- MongoDB database
- Firebase project (for authentication)
- Stripe account (for payments)

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
   STRIPE_SECRET_KEY=your_stripe_secret_key
   ```
4. Add your Firebase service account JSON file as `firebase-admin.json` in the root directory.
5. Start the server:
   ```bash
   node index.js
   ```

## API Endpoints

### Users
- `GET /users` - Get all users (organizer only)
- `GET /users/:email` - Get user by email
- `POST /users` - Register a new user
- `PATCH /users/last-login/:email` - Update user's last login time
- `PUT /user` - Update user role (protected)

### Camps
- `GET /camps` - Get all camps (with pagination, search, filter)
- `GET /popular-camps` - Get top 8 popular camps
- `GET /camp-details/:id` - Get camp details by ID
- `POST /camp` - Create a new camp (organizer only)
- `PATCH /update-camp/:id` - Update camp (organizer only)
- `DELETE /delete-camp/:campId` - Delete camp (organizer only)

### Registrations & Payments
- `GET /camp-registrations` - Get camp registrations (protected)
- `POST /camp-registrations` - Register for a camp
- `PATCH /camp-registrations/:id/confirm` - Confirm registration (organizer only)
- `POST /create-payment-intent` - Create Stripe payment intent
- `POST /payments` - Record payment
- `GET /payment-history` - Get payment history (with pagination)

### Feedback & Contact
- `GET /feedbacks` - Get all feedback
- `POST /feedback` - Submit feedback (protected)
- `POST /contact-messages` - Submit contact message

### Dashboard
- `GET /dashboard/participant-overview` - Participant analytics (protected)
- `GET /dashboard/organizer-overview` - Organizer analytics (organizer only)

## Deployment
This server can be deployed on platforms like Vercel. See `vercel.json` for configuration.

## Security
- All protected routes require a valid Firebase access token in the `Authorization` header:  
  `Authorization: Bearer <token>`
- Role-based access enforced via middleware.

## License
MIT
