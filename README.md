Overview
The Asset Link Plugin is designed to connect assets within a metaverse space through interactive triggers and responses. Its main goal is to let you synchronize animations and sound effects across multiple objects using a shared ActionID. In addition, you can control where the sound is played—either from the object itself (local audio) or relayed to a secondary audio output.

Components and Their Functionalities
1. Trigger Component
Purpose:
This component detects user interactions (clicks, proximity events, or multi-proximity events) and sends out a trigger message based on a defined ActionID. These triggers can be received by one or more Receiver Components that are listening for the same ActionID.

Key Fields:

Input Type:

Options: On-Click, Proximity, Multi-Proximity.
Impact:
On-Click: The trigger activates when the object is clicked.
Proximity: The trigger activates when a user comes within a specified distance of the object.
Multi-Proximity: Similar to Proximity, but the trigger requires a minimum number of users to be within range.
Dynamic Updating:
The component checks for changes in this field every 500 milliseconds and updates itself without needing a refresh.
Proximity Distance:

Type: Number
Impact: Sets the threshold distance (in meters) for proximity-based triggering.
Required Users (Multi-Proximity mode):

Type: Number
Impact: Specifies how many users must be within the proximity range for the trigger to activate.
ActionID:

Type: Text input
Impact: This is the unique identifier used to link triggers with the corresponding receiver(s). Only receivers with a matching ActionID will respond.
Admin Only:

Type: Checkbox
Impact: When checked, only users with admin privileges can activate the trigger.
Dynamic Behavior:

Changes in the settings (like switching from On-Click to Proximity) are detected and applied dynamically.
No refresh is required when updating these settings.
2. Receiver Component
Purpose:
This component listens for trigger messages that share the same ActionID. When a trigger is received, the receiver executes animations and sound effects based on its settings. The receiver supports two modes of animation:

Reactive Mode:
Plays a one-off “active” animation (for example, a quick flash or highlight) and then reverts to a default (idle) animation.
Transition Mode:
Cycle Mode:
The asset cycles between a series of predefined static states (such as “idle,” “active,” “expanded,” etc.).
Forward and reverse transitions are defined so that the asset can move between states in both directions.
Mapping Mode:
Custom transitions are defined via a JSON array. Each mapping specifies a “from” state, a “to” state, and the animations (and optional sounds) that should play for both the forward and reverse transitions.
Key Fields:

ActionID:

Type: Text input
Impact: Determines which trigger messages this receiver responds to. It must match the ActionID used by the trigger component.
Admin Only:

Type: Checkbox
Impact: When enabled, this receiver only processes triggers sent by admin users.
Sound Settings Section (applies to both Reactive and Transition modes):

Sound:
Type: Text input (URL or path)
Impact: Specifies the audio file to play when the receiver is activated.
Volume:
Type: Slider (0 to 1)
Impact: Controls the volume level of the audio playback.
Disable Local Audio:
Type: Checkbox
Impact:
When enabled, the receiver will not play sound directly from its own location. Instead, it will send a “relaySound” message to any attached Secondary Audio Output components, so that the sound can be played from an alternative location.
This setting is dynamically updated, meaning changes will be applied without needing to reattach the component or refresh the page.
Animation Settings:

Animation Mode:
Options: Reactive, Transition.
Impact:
Reactive: The receiver plays a single “active” animation when triggered, then reverts to its default (idle) state.
Transition: The receiver can cycle between different static states or follow a custom mapping for transitions.
Reactive Animation & Default Animation:
Type: Text inputs
Impact: Define the names of the animations to use in Reactive mode.
Cooldown:
Type: Number
Impact: Sets the minimum time before the receiver can be triggered again.
Transition Settings (only relevant if Animation Mode is set to Transition):
Transition Mode:
Options: Cycle, Mapping.
Impact:
Cycle Mode: The asset moves through a series of static states using forward and reverse transition animations.
Mapping Mode: Uses a custom JSON mapping to define transitions.
Static States:
Type: Text input (comma-separated list)
Impact: Lists the static state animations between which the asset can transition.
Forward Transitions & Reverse Transitions:
Type: Text inputs (comma-separated lists)
Impact: Define the animations that play when moving forward or in reverse between static states.
Initial State (Mapping Mode):
Type: Text input
Impact: Sets the starting state for the asset.
Transition Mapping (Mapping Mode):
Type: Text input (JSON array)
Impact: Allows you to define custom transitions with specific animations (and optional sounds) for moving between states.
Dynamic Behavior:

The receiver periodically checks (every second) for updates in its settings. This means that changes such as toggling “Disable Local Audio” are applied dynamically without needing to refresh or reattach the component.
Persistent fields like currentState and currentDirection are saved to the asset’s properties. If your backend supports persistence, the asset will load in its last state (and remember the cycle direction) even between sessions.
3. Asset Link Secondary Audio Output Component
Purpose:
This component is designed to “relay” sound. It listens for relaySound messages sent by a receiver. When it receives such a message and if the sourceID matches its configured value, it plays the audio from its own location. This is useful if you want the sound to appear as though it is coming from a different location than the asset that was triggered.

Key Fields:

Source Object ID:
Type: Text input
Impact:
Specifies the ID of the object whose audio is to be relayed.
Only messages with a matching sourceID will cause this component to play sound.
Dynamic Behavior:

The secondary component updates its settings dynamically when the Source Object ID is changed. No refresh is required for these changes.
Summary
Trigger Component:
Detects user interactions (clicks, proximity, multi-proximity) and sends out a trigger message with a unique ActionID. Its settings update dynamically without a refresh.

Receiver Component:
Listens for trigger messages with the matching ActionID and then plays animations and sound based on its mode (Reactive or Transition). It has sound settings (sound file, volume, disable local audio) that affect how audio is played. It also preserves the asset’s current state and transition direction persistently if supported. Settings are updated dynamically.

Secondary Audio Output Component:
Relays sound from a specified source so that audio can be played from an alternative location. It listens for relay messages and acts accordingly, with settings that update dynamically.
