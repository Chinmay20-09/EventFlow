// lib/screens/coordinator_dashboard.dart
import 'package:flutter/material.dart';

class CoordinatorDashboard extends StatelessWidget {
  const CoordinatorDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Coordinator Command'),
        backgroundColor: Colors.blueGrey,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          const ListTile(
            leading: Icon(Icons.people),
            title: Text('Zone A Capacity: 85%'),
            subtitle: Text('Approaching bottleneck threshold'),
          ),
          const Divider(),
          ElevatedButton.icon(
            icon: const Icon(Icons.report_problem),
            label: const Text('Report Local Incident to AI Engine'),
            onPressed: () {
              // TODO: Send POST request to P3 Backend to trigger P1/P2 recalculation
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Incident reported to EventFlow Engine')),
              );
            },
          )
        ],
      ),
    );
  }
}