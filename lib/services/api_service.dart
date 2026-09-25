import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  // TODO: Replace with the actual IP address or domain P3 uses for the FastAPI server.
  // If testing locally on Android emulator, use 10.0.2.2. For web or iOS, use 127.0.0.1.
  static const String baseUrl = 'http://127.0.0.1:8000/api'; 

  static Future<bool> loginUser(String role) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'role': role}),
      );
      
      if (response.statusCode == 200) {
        // In a production app, save the returned JWT token securely here.
        return true;
      }
      return false;
    } catch (e) {
      // Log error to an observability platform (part of your SHOULD requirements)
      print('Network Error: $e');
      return false; 
    }
  }

  static Future<bool> reportIncident(String zone, String issue) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/coordinator/report'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'zone': zone, 'issue': issue}),
      );
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}