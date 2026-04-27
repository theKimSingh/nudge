import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { Colors } from '@/src/constants/theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { ThemedView } from '@/src/components/themed-view';
import { ThemedText } from '@/src/components/themed-text';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';

const { width, height } = Dimensions.get('window');

export default function VoiceChatScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ type: 'user' | 'system'; text: string }[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);

  React.useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Request audio permissions
    requestAudioPermissions();
  }, []);

  const requestAudioPermissions = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Audio recording permission is required to use voice features.');
      }
    } catch (error) {
      console.error('Error requesting audio permissions:', error);
    }
  };

  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        playThroughEarpieceAndroid: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        recordingRef.current = null;
        setIsRecording(false);

        // For now, just show a message that voice was recorded
        // In a real app, you'd send this to a speech-to-text service
        setChatHistory(prev => [...prev, {
          type: 'user',
          text: '🎙️ Voice message recorded! (Speech-to-text processing would happen here)'
        }]);

        // Simulate processing and adding to calendar
        setTimeout(() => {
          setChatHistory(prev => [...prev, {
            type: 'system',
            text: '✅ Added "Meeting with team at 2 PM" to your calendar for today!'
          }]);
        }, 1500);

        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsRecording(false);
    }
  };

  const handleVoicePress = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleSendMessage = () => {
    if (message.trim()) {
      setChatHistory([...chatHistory, { type: 'user', text: message }]);
      setMessage('');
      // TODO: Send message to backend/API for processing
      // For now, add a mock response
      setTimeout(() => {
        setChatHistory(prev => [...prev, { type: 'system', text: 'Got it! I\'ve added this to your schedule.' }]);
      }, 500);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.back();
    });
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.gradientBackground}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
        >
          <View style={styles.header}>
            <View style={{ width: 80 }} />
            <View style={styles.headerContent}>
              <IconSymbol size={32} name="mic.fill" color="#fff" />
              <ThemedText type="title" style={styles.headerTitle}>Plan Your Day</ThemedText>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.backButton}>
              <IconSymbol size={20} name="chevron.left" color="#fff" />
              <Text style={styles.backButtonText}>Return</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.chatContainer}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
            {chatHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.micIconContainer}>
                  <Text style={styles.emojiIcon}>💬</Text>
                </View>
                <ThemedText type="subtitle" style={styles.emptyText}>
                  Speak your plan or type below
                </ThemedText>
                <ThemedText style={styles.emptySubtext}>
                  I'll help organize your day and keep you on track
                </ThemedText>
              </View>
            ) : (
              chatHistory.map((msg, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.messageBubble,
                    msg.type === 'user' ? styles.userBubble : styles.systemBubble,
                  ]}
                >
                  <ThemedText style={msg.type === 'user' ? styles.userText : styles.systemText}>
                    {msg.text}
                  </ThemedText>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.inputContainer}>
            <TouchableOpacity
              style={[styles.voiceButton, isRecording && styles.voiceButtonActive]}
              onPress={handleVoicePress}
              activeOpacity={0.8}
            >
              <IconSymbol
                size={28}
                name={isRecording ? 'mic.slash.fill' : 'mic.fill'}
                color="#fff"
              />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              placeholder="Tell me your plan for today..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={message}
              onChangeText={setMessage}
              multiline
              maxHeight={100}
              autoFocus={false}
            />

            <TouchableOpacity
              style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!message.trim()}
              activeOpacity={0.8}
            >
              <IconSymbol
                size={24}
                name="paperplane.fill"
                color={message.trim() ? '#667eea' : 'rgba(255,255,255,0.3)'}
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBackground: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  closeButton: {
    padding: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    gap: 4,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerContent: {
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  chatContainer: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  micIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emojiIcon: {
    fontSize: 60,
    textAlign: 'center',
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  messageBubble: {
    marginVertical: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
    borderBottomRightRadius: 4,
  },
  systemBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: '#333',
    fontSize: 16,
  },
  systemText: {
    color: '#333',
    fontSize: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    gap: 12,
  },
  voiceButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B6B',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  voiceButtonActive: {
    backgroundColor: '#FF4444',
    transform: [{ scale: 1.1 }],
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    color: '#333',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sendButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
});
