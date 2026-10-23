Gem::Specification.new do |spec|
  spec.name = 'octri-spec-auditor'
  spec.version = '0.1.3'
  spec.summary = 'Bindings for the offline Octri Rust Spec Auditor'
  spec.authors = ['Octri contributors']
  spec.homepage = 'https://github.com/octridev/octri-spec-auditor'
  spec.description = 'Audit OpenAPI documents offline with the bundled Octri Rust Spec Auditor.'
  spec.files = ['lib/octri_auditor.rb', 'lib/exact_json.rb', *Dir['lib/octri_auditor/native/*']]
  spec.required_ruby_version = '>= 3.1'
  spec.license = 'Apache-2.0'
  # Bundled rather than default gems from Ruby 3.4 (bigdecimal) and 4.0 (fiddle).
  spec.add_dependency 'bigdecimal'
  spec.add_dependency 'fiddle'
end
