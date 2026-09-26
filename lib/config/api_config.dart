class ApiConfig {
  // TODO: Replace with P3's actual Wi-Fi IPv4 address
  static const String host = '192.168.137.97:8000';

  static const String baseUrl = 'http://$host/api';
  static const String loginEndpoint = '$baseUrl/auth/login';
  static const String signupEndpoint = '$baseUrl/auth/signup'; // NEW
  static const String disruptionsEndpoint = '$baseUrl/disruptions/report';

  static const String wsAlertsUrl = 'ws://$host/ws/alerts';
}
