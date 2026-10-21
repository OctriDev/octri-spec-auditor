# frozen_string_literal: true

require 'fiddle'
require 'json'
require_relative 'exact_json'

module OctriAuditor
  class AuditError < StandardError
    attr_reader :code, :diagnostics
    def initialize(error)
      super(error.fetch('message'))
      @code = error.fetch('code')
      @diagnostics = error.fetch('diagnostics', [])
    end
  end

  class Auditor
    def initialize(library)
      @library = Fiddle.dlopen(File.realpath(library))
      @version = function('abi_version', [], Fiddle::TYPE_INT)
      raise 'Expected auditor ABI version 1' unless @version.call == 1
      @call = function('call', [Fiddle::TYPE_VOIDP, Fiddle::TYPE_SIZE_T], Fiddle::TYPE_VOIDP)
      @data = function('buffer_data', [Fiddle::TYPE_VOIDP], Fiddle::TYPE_VOIDP)
      @length = function('buffer_len', [Fiddle::TYPE_VOIDP], Fiddle::TYPE_SIZE_T)
      @free = function('buffer_free', [Fiddle::TYPE_VOIDP], Fiddle::TYPE_VOID)
    end

    def call(envelope)
      input = OctriExactJSON.generate(envelope).encode(Encoding::UTF_8)
      raise ArgumentError, 'Auditor envelope exceeds 128 MiB' if input.bytesize > 128 * 1024 * 1024
      output = @call.call(Fiddle::Pointer[input], input.bytesize)
      raise NoMemoryError, 'Native auditor returned a null buffer' if output.null?
      begin
        text = @data.call(output).to_s(@length.call(output)).force_encoding(Encoding::UTF_8)
      ensure
        @free.call(output)
      end
      OctriExactJSON.parse(text)
    end

    def audit(request) = result('audit', 'request' => request)
    def fix(request) = result('fix', 'request' => request)
    def bundle(request) = result('bundle', 'request' => request)
    def compare(before, after) = result('compare', 'before' => before, 'after' => after)
    def export(report, format = 'json') = result('export', 'report' => report, 'format' => format)
    def rules = result('rules')

    private

    def function(name, args, output)
      Fiddle::Function.new(@library["octri_auditor_#{name}"], args, output)
    end

    def result(action, fields = {})
      response = call({ 'abiVersion' => 1, 'action' => action }.merge(fields))
      raise AuditError, response['Err'] if response.key?('Err')
      response.fetch('Ok')
    end
  end

  def self.text(content, uri = 'memory://audit/openapi.yaml')
    { 'uri' => uri, 'content' => content, 'generated' => false }
  end
end
