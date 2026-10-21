#ifndef OCTRI_AUDITOR_H
#define OCTRI_AUDITOR_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct OctriAuditorBuffer OctriAuditorBuffer;
uint32_t octri_auditor_abi_version(void);
/* Input buffers are zero-filled. Maximum input: 128 MiB. */
OctriAuditorBuffer *octri_auditor_buffer_new(size_t length);
/* Borrow input until call returns. Output belongs to this loaded library. */
OctriAuditorBuffer *octri_auditor_call(const uint8_t *data, size_t length);
/* Buffers have no NUL terminator. Write only newly allocated input buffers. */
uint8_t *octri_auditor_buffer_data(OctriAuditorBuffer *buffer);
size_t octri_auditor_buffer_len(const OctriAuditorBuffer *buffer);
/* Free every allocation exactly once, with no overlapping access. NULL is safe. */
void octri_auditor_buffer_free(OctriAuditorBuffer *buffer);
#ifdef __cplusplus
}
#endif
#endif
