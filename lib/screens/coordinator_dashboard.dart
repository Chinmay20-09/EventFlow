import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/orchestrator_models.dart';
import '../services/websocket_service.dart';
import 'login_screen.dart';

class CoordinatorDashboard extends StatefulWidget {
  final String email;
  const CoordinatorDashboard({super.key, required this.email});

  @override
  State<CoordinatorDashboard> createState() => _CoordinatorDashboardState();
}

class _CoordinatorDashboardState extends State<CoordinatorDashboard> {
  final WebSocketService _wsService = WebSocketService();

  // NEW: A list to hold our live backend prints
  final List<String> _backendLogs = [
    "System Initialized. Awaiting commands...",
  ];

  @override
  void initState() {
    super.initState();
    _wsService.connect(widget.email, UserRole.coordinator);
  }

  @override
  void dispose() {
    _wsService.disconnect();
    super.dispose();
  }

  void _triggerEmergency(String zone, String type) async {
    setState(() {
      _backendLogs.insert(0, "Sending POST request to FastAPI...");
    });

    // Capture the exact string response from the backend
    final backendResponse = await ApiService.reportDisruption(
      zone,
      type,
      'critical',
    );

    if (mounted) {
      setState(() {
        // Print the real backend response to our dashboard terminal
        _backendLogs.insert(0, "Backend Reply: $backendResponse");
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text(
          'Ops Command Center',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.exit_to_app, color: Colors.white),
            onPressed: () => Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (_) => const LoginScreen()),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Top Half: Controls
          Expanded(
            flex: 3,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'NETWORK HEALTH',
                  style: TextStyle(
                    color: Color(0xFF94A3B8),
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 12),
                _buildZoneCard('Zone Alpha', '88%', Colors.orange),
                _buildZoneCard('Zone Beta', '42%', Colors.green),
                _buildZoneCard('Corridor 3', '95%', Colors.redAccent),

                const SizedBox(height: 32),
                const Text(
                  'EMERGENCY OVERRIDES',
                  style: TextStyle(
                    color: Color(0xFF94A3B8),
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 12),

                InkWell(
                  onTap: () =>
                      _triggerEmergency('Corridor 3', 'Severe Bottleneck'),
                  child: Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.1),
                      border: Border.all(color: Colors.red),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.campaign, color: Colors.red, size: 36),
                        SizedBox(width: 16),
                        Expanded(
                          child: Text(
                            'DECLARE BOTTLENECK\nForce AI Reroute (Corridor 3)',
                            style: TextStyle(
                              color: Colors.red,
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Bottom Half: Live Backend Terminal
          Expanded(
            flex: 2,
            child: Container(
              width: double.infinity,
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.terminal, color: Colors.greenAccent, size: 16),
                      SizedBox(width: 8),
                      Text(
                        'LIVE BACKEND TERMINAL',
                        style: TextStyle(
                          color: Colors.greenAccent,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.2,
                        ),
                      ),
                    ],
                  ),
                  const Divider(color: Color(0xFF334155)),
                  Expanded(
                    child: ListView.builder(
                      itemCount: _backendLogs.length,
                      itemBuilder: (context, index) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8.0),
                          child: Text(
                            "> ${_backendLogs[index]}",
                            style: const TextStyle(
                              color: Color(0xFFA3E635),
                              fontFamily:
                                  'monospace', // Makes it look like real code
                              fontSize: 13,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildZoneCard(String name, String density, Color color) {
    return Card(
      color: const Color(0xFF1E293B),
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(Icons.data_usage, color: color),
        title: Text(
          name,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        trailing: Text(
          'Density: $density',
          style: TextStyle(color: color, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}
