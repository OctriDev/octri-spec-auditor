import 'dart:convert';
import 'dart:io';
import 'package:octri_spec_auditor/octri_spec_auditor.dart';

Future<void> main(List<String> args) async {
  final auditor = Auditor(args[0]);
  final input = (jsonDecode(await stdin.transform(utf8.decoder).join())
          as Map<String, dynamic>)
      .cast<String, Object?>();
  Map<String, Object?> field(String name) => (input[name] as Map<String, dynamic>).cast<String, Object?>();
  final action = input['action'];
  if (input['abiVersion'] == 1 && ['audit', 'fix', 'bundle', 'compare', 'export', 'rules'].contains(action)) {
    final Object? value = switch (action) {
      'audit' => auditor.audit(field('request')),
      'fix' => auditor.fix(field('request')),
      'bundle' => auditor.bundle(field('request')),
      'compare' => auditor.compare(field('before'), field('after')),
      'export' => auditor.export(field('report'), format: input['format'] as String),
      _ => auditor.rules(),
    };
    stdout.write(jsonEncode({'Ok': value}));
  } else {
    stdout.write(auditor.callJson(input));
  }
}
