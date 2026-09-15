import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditableProfileUpdate } from './profileUpdate';

test('profile edits omit fields that are not exposed by the native editor', () => {
  const update = createEditableProfileUpdate('Name', 'handle', 'Bio');
  assert.deepEqual(update, { name: 'Name', handle: 'handle', bio: 'Bio' });
  assert.equal('avatarObjectPath' in update, false);
  assert.equal('location' in update, false);
  assert.equal('website' in update, false);
  assert.equal('previewTranscript' in update, false);
});