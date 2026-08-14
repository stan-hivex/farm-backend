// Example Flutter widget demonstrating network fetch and submit
// Place this file in your Flutter app and adapt imports/state management as needed.

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class CryptoWithdrawForm extends StatefulWidget {
  final String apiBaseUrl; // e.g. https://api.your-backend.com/api/v1
  final String jwt; // auth token
  const CryptoWithdrawForm({required this.apiBaseUrl, required this.jwt, Key? key}) : super(key: key);

  @override
  _CryptoWithdrawFormState createState() => _CryptoWithdrawFormState();
}

class _CryptoWithdrawFormState extends State<CryptoWithdrawForm> {
  String token = 'USDC';
  List<Map<String, String>> networks = [];
  String? selectedNetwork; // providerCode
  final _addressCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _pinCtrl = TextEditingController();
  bool loading = false;
  String? message;

  @override
  void initState() {
    super.initState();
    fetchNetworks();
  }

  Future<void> fetchNetworks() async {
    setState(() { loading = true; message = null; });
    final url = '${widget.apiBaseUrl}/withdraw/crypto/networks?token=$token';
    try {
      final resp = await http.get(Uri.parse(url), headers: { 'Authorization': 'Bearer ${widget.jwt}' });
      if (resp.statusCode != 200) throw Exception('Failed to fetch networks: ${resp.statusCode}');
      final body = json.decode(resp.body) as Map<String, dynamic>;
      final data = (body['data'] as List<dynamic>?) ?? [];
      networks = data.map((e) => {
        'providerCode': (e['providerCode'] ?? '').toString(),
        'displayName': (e['displayName'] ?? '').toString(),
      }).where((m) => m['providerCode']!.isNotEmpty).toList();
      selectedNetwork = networks.isNotEmpty ? networks[0]['providerCode'] : null;
    } catch (e) {
      message = e.toString();
    } finally {
      setState(() { loading = false; });
    }
  }

  Future<void> submitWithdraw() async {
    final address = _addressCtrl.text.trim();
    final amount = double.tryParse(_amountCtrl.text.trim());
    final pin = _pinCtrl.text.trim();
    if (address.isEmpty || amount == null || amount <= 0 || pin.isEmpty || selectedNetwork == null) {
      setState(() { message = 'Please fill all fields and select a supported network.'; });
      return;
    }

    setState(() { loading = true; message = null; });

    final payload = {
      'method': 'CRYPTO',
      'amount': amount,
      'cryptoAsset': token,
      'network': selectedNetwork,
      'cryptoAddress': address,
      'pin': pin,
    };

    final url = '${widget.apiBaseUrl}/withdraw/create';
    try {
      final resp = await http.post(Uri.parse(url),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${widget.jwt}',
        },
        body: json.encode(payload),
      );

      if (resp.statusCode == 201 || resp.statusCode == 200) {
        final body = json.decode(resp.body) as Map<String, dynamic>;
        setState(() { message = 'Withdrawal created: ${body['reference'] ?? body}'; });
      } else {
        final body = resp.body.isNotEmpty ? json.decode(resp.body) : resp.body;
        setState(() { message = 'Failed: ${resp.statusCode} ${body}'; });
      }
    } catch (e) {
      setState(() { message = 'Request failed: $e'; });
    } finally {
      setState(() { loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        DropdownButtonFormField<String>(
          value: selectedNetwork,
          items: networks.map((n) => DropdownMenuItem(
            value: n['providerCode'],
            child: Text(n['displayName'] ?? n['providerCode'] ?? ''),
          )).toList(),
          onChanged: (v) => setState(() => selectedNetwork = v),
          decoration: InputDecoration(labelText: 'Network'),
        ),
        TextFormField(controller: _addressCtrl, decoration: InputDecoration(labelText: 'Destination address')),
        TextFormField(controller: _amountCtrl, decoration: InputDecoration(labelText: 'Amount (FARM)'), keyboardType: TextInputType.number),
        TextFormField(controller: _pinCtrl, decoration: InputDecoration(labelText: 'PIN'), obscureText: true),
        SizedBox(height: 12),
        if (loading) CircularProgressIndicator(),
        if (message != null) Text(message!, style: TextStyle(color: Colors.red)),
        ElevatedButton(onPressed: loading ? null : submitWithdraw, child: Text('Send withdrawal')),
      ],
    );
  }
}
