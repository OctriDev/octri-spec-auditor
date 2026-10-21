#include "octri_auditor.h"
#include <assert.h>
#include <string.h>

int main(void) {
    assert(octri_auditor_abi_version() == 1);
    assert(octri_auditor_buffer_new(129u * 1024u * 1024u) == NULL);
    assert(octri_auditor_buffer_data(NULL) == NULL);
    assert(octri_auditor_buffer_len(NULL) == 0);
    octri_auditor_buffer_free(NULL);
    const char *request = "{\"abiVersion\":1,\"action\":\"rules\"}";
    OctriAuditorBuffer *output = octri_auditor_call((const uint8_t *)request, strlen(request));
    assert(output != NULL);
    assert(octri_auditor_buffer_len(output) > 100);
    assert(memcmp(octri_auditor_buffer_data(output), "{\"Ok\":", 6) == 0);
    octri_auditor_buffer_free(output);
    output = octri_auditor_call(NULL, 1);
    assert(output != NULL);
    assert(memcmp(octri_auditor_buffer_data(output), "{\"Err\":", 7) == 0);
    octri_auditor_buffer_free(output);
    return 0;
}
