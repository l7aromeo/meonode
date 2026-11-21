// Two different styles that get one class name today: with the declarations
// MeoNode adds to every styled element, Emotion's name for both texts is the same.
// They differ only in their colour.

/** The first of the two styles. */
export const FIRST = { color: '#02ab73', padding: '4px' }

/** The second, which differs from the first in its colour alone. */
export const SECOND = { color: '#031998', padding: '4px' }

/** {@link FIRST}'s colour as a computed style reads it. */
export const FIRST_RGB = 'rgb(2, 171, 115)'

/** {@link SECOND}'s colour as a computed style reads it. */
export const SECOND_RGB = 'rgb(3, 25, 152)'
