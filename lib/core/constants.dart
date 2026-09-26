// lib/core/constants.dart
class Constants {
  static const String backendApiUrl = 'https://your-p3-backend.com/api';
  static const String webSocketUrl = 'wss://your-p3-backend.com/ws/alerts';
}

// lib/models/user.dart
enum UserRole { visitor, coordinator }

class User {
  final String id;
  final String name;
  final UserRole role;

  User({required this.id, required this.name, required this.role});
}
