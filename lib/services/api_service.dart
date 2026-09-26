import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

class ApiService {
  // --- AUTHENTICATION: SIGN UP ---
  // Matches backend RegisterRequest: username, email, password
  static Future<Map<String, dynamic>> signUp(
    String username,
    String email,
    String password,
  ) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConfig.signupEndpoint),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'username': username,
          'email': email,
          'password': password,
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 || response.statusCode == 201) {
        return {
          'success': true,
          'message': 'Account created successfully. Please sign in.',
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Registration failed',
        };
      }
    } catch (e) {
      return {'success': false, 'message': 'Failed to connect to backend.'};
    }
  }

  // --- AUTHENTICATION: LOGIN ---
  // Matches backend LoginRequest: login, password
  static Future<Map<String, dynamic>> login(
    String loginIdentifier,
    String password,
  ) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConfig.loginEndpoint),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'login':
              loginIdentifier, // Backend accepts either email or username here
          'password': password,
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200) {
        // Handle the backend ok() envelope (unwraps 'data' if it exists)
        final payload = data['data'] ?? data;

        // Extract the role from the backend database response
        final role = payload['user']['role'];
        final email = payload['user']['email'];

        return {'success': true, 'role': role, 'email': email};
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Invalid credentials',
        };
      }
    } catch (e) {
      return {'success': false, 'message': 'Failed to connect to backend.'};
    }
  }

  // --- REPORT DISRUPTION ---
  static Future<String> reportDisruption(
    String zone,
    String type,
    String severity,
  ) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConfig.disruptionsEndpoint),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          "type": type,
          "severity": severity,
          "affected_nodes": [12, 13],
          "affected_edges": [24, 25],
          "start_time": DateTime.now().toUtc().toIso8601String(),
          "expected_duration": 1800,
          "source": "coordinator_app",
        }),
      );
      return "Code ${response.statusCode}: ${response.body}";
    } catch (e) {
      return "Connection Failed: $e";
    }
  }
}
