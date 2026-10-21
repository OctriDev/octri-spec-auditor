require 'json'
require_relative 'lib/octri_auditor'
auditor = OctriAuditor::Auditor.new(ARGV.fetch(0))
input = OctriExactJSON.parse(STDIN.read)
action = input['action']
result = if input['abiVersion'] != 1 || !%w[audit fix bundle compare export rules].include?(action)
  auditor.call(input)
else
  value = case action
  when 'audit', 'fix', 'bundle' then auditor.public_send(action, input.fetch('request'))
  when 'compare' then auditor.compare(input.fetch('before'), input.fetch('after'))
  when 'export' then auditor.export(input.fetch('report'), input.fetch('format'))
  when 'rules' then auditor.rules
  end
  { 'Ok' => value }
end
puts OctriExactJSON.generate(result)
