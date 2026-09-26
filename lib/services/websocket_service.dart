import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config/api_config.dart';
import '../models/orchestrator_models.dart';

class WebSocketService {
  WebSocketChannel? _channel;

  Stream<AlertMessage> get alertStream {
    if (_channel == null) return const Stream.empty();
    return _channel!.stream.map((event) {
      final data = jsonDecode(event as String);
      return AlertMessage.fromJson(data);
    });
  }

  void connect(String userEmail, UserRole role) {
    try {
      final uri = Uri.parse(
        '${ApiConfig.wsAlertsUrl}?email=$userEmail&role=${role.name}',
      );
      _channel = WebSocketChannel.connect(uri);
    } catch (e) {
      print('WS Connection Failed: $e');
    }
  }

  void disconnect() {
    _channel?.sink.close(1000, 'Client disconnected naturally');
    _channel = null;
  }
}
