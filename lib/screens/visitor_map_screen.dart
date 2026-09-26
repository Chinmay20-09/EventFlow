// lib/screens/visitor_map_screen.dart
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../services/websocket_service.dart';

class VisitorMapScreen extends StatefulWidget {
  const VisitorMapScreen({super.key});

  @override
  State<VisitorMapScreen> createState() => _VisitorMapScreenState();
}

class _VisitorMapScreenState extends State<VisitorMapScreen> {
  final WebSocketService _wsService = WebSocketService();
  String? _currentAlert;

  @override
  void initState() {
    super.initState();
    _wsService.connect();
    _listenForAlerts();
  }

  void _listenForAlerts() {
    _wsService.alertStream.listen(
      (data) {
        // Expecting JSON like: {"message": "Gate A congested. Rerouting.", "severity": "high"}
        setState(() {
          _currentAlert = data['message'];
        });
      },
      onError: (error) {
        debugPrint('WebSocket Error: $error');
      },
    );
  }

  @override
  void dispose() {
    _wsService.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('EventFlow - Active Route')),
      body: Stack(
        children: [
          // Background: The interactive map
          const GoogleMap(
            initialCameraPosition: CameraPosition(
              target: LatLng(
                19.0760,
                72.8777,
              ), // Default coordinates (e.g., event venue)
              zoom: 15,
            ),
            myLocationEnabled: true,
          ),

          // Foreground: Real-time Alert Banner
          if (_currentAlert != null)
            Positioned(
              top: 16,
              left: 16,
              right: 16,
              child: Material(
                elevation: 4,
                borderRadius: BorderRadius.circular(8),
                color: Colors.redAccent,
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    children: [
                      const Icon(Icons.warning, color: Colors.white),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _currentAlert!,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, color: Colors.white),
                        onPressed: () => setState(() => _currentAlert = null),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
