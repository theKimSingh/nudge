//
//  WisprService.swift
//  Nudge
//
//  Created by Gordon Huang
//

import Foundation
import AVFoundation

class WisprService {
    static let shared = WisprService()
    
    private init() {}
    
    func startSpeechToText(completion: @escaping (String?) -> Void) {
        // Implement speech-to-text using Wispr API or SFSpeechRecognizer
        // For now, placeholder
        completion("Sample transcribed text")
    }
    
    func stopSpeechToText() {
        // Stop recording
    }
}