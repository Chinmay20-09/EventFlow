enum UserRole { visitor, coordinator }

class AlertMessage {
  final String id;
  final String message;
  final String severity;
  final String zone;
  final String? newRoute;

  AlertMessage({
    required this.id,
    required this.message,
    required this.severity,
    required this.zone,
    this.newRoute,
  });

  factory AlertMessage.fromJson(Map<String, dynamic> json) {
    return AlertMessage(
      id: json['id'] ?? 'N/A',
      message: json['message'] ?? '',
      severity: json['severity'] ?? 'info',
      zone: json['zone'] ?? 'Global',
      newRoute: json['new_route'],
    );
  }
}
