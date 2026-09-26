import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../main.dart'; // To access UserRole enum
import '../models/user_role.dart';

class AuthService {
  static Future<bool> authenticate({
    required String email,
    required String password,
    required UserRole role,
    required bool isSignUp,
  }) async {
    final endpoint = isSignUp ? '/auth/signup' : '/auth/login';
    final url = Uri.parse('${ApiConfig.baseUrl}$endpoint');

    try {
      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': email,
          'password': password,
          'role': role == UserRole.visitor ? 'visitor' : 'coordinator',
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        // In a production app, save the returned JWT token securely here
        return true;
      }
      return false;
    } catch (e) {
      print('Network Error: $e');
      return false;
    }
  }
}
