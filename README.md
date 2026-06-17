# LABEL UNIVERSE

A streamlined USPS label management portal built with the MERN stack, designed to facilitate efficient communication and file exchange between admins (who generate labels) and users/resellers (who need them).

## 🚀 Features

### Core Functionalities
- **User Management**: Admin can add, delete, read, or update any user credentials
- **Role Hierarchy**: Admin > Reseller > Simple User (with permission-based access)
- **File Upload System**: Both users and resellers upload bulk label files
- **Admin Processing**: Admin updates the processed/generated USPS label file within 1–2 hours
- **Email Alerts**: Real-time notifications for file uploads and completions
- **Real-Time Updates**: Users can see file status and download files instantly
- **Secure Authentication**: JWT + bcrypt for secure login system

### User Roles
- **Admin**: Manages all accounts, promotes users, processes files, generates USPS labels
- **Reseller**: Uploads bulk label request files, manages clients, receives generated labels
- **Simple User**: Uploads bulk label files, downloads generated labels when available

## 🛠 Tech Stack

### Backend
- **Node.js** + **Express.js** - Server framework
- **MongoDB** - Database with GridFS for file storage
- **JWT** + **bcrypt** - Authentication and password hashing
- **Multer/GridFS** - File upload and storage
- **Nodemailer** - Email notifications
- **Socket.io** - Real-time communication

### Frontend
- **React.js** with **TypeScript** - Frontend framework
- **Tailwind CSS** - Styling and UI components
- **Axios** - HTTP client
- **React Router** - Client-side routing
- **Context API** - State management
- **Socket.io Client** - Real-time updates

### Deployment
- **GitHub** - Version control
- **Railway** - CI/CD pipeline and hosting

## 📦 Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- Git

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd usps-label-portal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp env.example .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   MONGODB_URI=mongodb://localhost:27017/usps-label-portal
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRE=7d
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   PORT=5000
   NODE_ENV=development
   CLIENT_URL=http://localhost:3000
   ```

4. **Start the server**
   ```bash
   npm run server
   ```

### Frontend Setup

1. **Navigate to client directory**
   ```bash
   cd client
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

### Full Development Setup

To run both backend and frontend simultaneously:

```bash
# From the root directory
npm run dev
```

## 🔧 Configuration

### Database
- **MongoDB**: Configure your MongoDB connection string in the `.env` file
- **GridFS**: Used for storing uploaded files efficiently

### Email Configuration
- **Gmail**: Set up App Password for Gmail SMTP
- **SMTP**: Configure your email service provider settings

### Authentication
- **JWT Secret**: Generate a strong secret key for JWT tokens
- **Password Hashing**: bcrypt with salt rounds of 12

## 📱 Usage

### For Admins
1. **Login** with admin credentials
2. **Manage Users**: Create, edit, delete users and assign roles
3. **Process Files**: Update file status and upload generated labels
4. **Monitor System**: View dashboard with statistics and recent activity

### For Resellers
1. **Login** with reseller credentials
2. **Upload Files**: Upload bulk label request files
3. **Manage Clients**: View and manage assigned clients
4. **Download Labels**: Download completed labels for clients

### For Users
1. **Login** with user credentials
2. **Upload Files**: Upload bulk label request files
3. **Track Status**: Monitor file processing status
4. **Download Labels**: Download completed labels

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with salt rounds
- **Role-based Access Control**: Different permissions for different user types
- **File Validation**: Type and size validation for uploads
- **Rate Limiting**: API rate limiting to prevent abuse
- **CORS Configuration**: Proper CORS setup for security

## 📧 Email Notifications

- **File Upload**: Admin receives notification when files are uploaded
- **Label Completion**: Users receive notification when labels are ready
- **Password Reset**: Secure password reset via email
- **User Creation**: Welcome emails for new users

## 🚀 Deployment

### Railway Deployment

1. **Connect GitHub Repository** to Railway
2. **Set Environment Variables** in Railway dashboard
3. **Deploy** - Railway will automatically build and deploy

### Environment Variables for Production
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/usps-label-portal
JWT_SECRET=your-production-jwt-secret
JWT_EXPIRE=7d
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-production-email@gmail.com
EMAIL_PASS=your-production-app-password
PORT=5000
NODE_ENV=production
CLIENT_URL=https://your-frontend-url.railway.app
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Users
- `GET /api/users` - Get all users (admin only)
- `POST /api/users` - Create user (admin only)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin only)

### Files
- `POST /api/files/upload` - Upload file
- `GET /api/files` - Get user files
- `GET /api/files/:id` - Get file details
- `GET /api/files/:id/download` - Download file
- `PUT /api/files/:id/status` - Update file status (admin only)
- `DELETE /api/files/:id` - Delete file

### Email
- `POST /api/email/send` - Send custom email (admin only)
- `POST /api/email/broadcast` - Send broadcast email (admin only)
- `POST /api/email/test` - Send test email (admin only)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support, email support@uspslabelportal.com or create an issue in the GitHub repository.

## 🎯 Roadmap

- [ ] Advanced file processing with AI
- [ ] Bulk operations for file management
- [ ] Advanced reporting and analytics
- [ ] Mobile app development
- [ ] Integration with USPS API
- [ ] Advanced user permissions system

---

**Built with ❤️ for efficient USPS label management**
