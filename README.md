# streamdeck-vextm
 [Stream Deck](https://www.elgato.com/en/welcome-to-stream-deck) plugin for controlling [VEX Tournament Manager](https://vextm.dwabtech.com/) using the [official API](https://kb.roboticseducation.org/hc/en-us/articles/19238156122135-TM-Public-API).
 
 ![image](https://user-images.githubusercontent.com/3682581/147676915-527bb66d-098a-4cb9-ad26-e0d1a23aeb94.png)


### Features
* Start and stop matches
* Queue next or previous match
* Queue driving & programming skills matches
* Control the audience display
* Reset timer

### Current Limitations
* The entire plugin can only be connected to one TM server and field set at a time. This means it is not possible to have different keys on the same stream deck, or even on different stream decks connected to the same computer, that control different field sets.
* The "Field Set ID" (and "Field ID" to queue skills matches) must be manually determined by the user. As a general rule, both start at 1 and count up from there. Field IDs are unique across the entire tournament.
