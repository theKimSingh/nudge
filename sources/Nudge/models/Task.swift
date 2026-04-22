//
//  NudgeTask.swift
//  Nudge
//
//  Created by Gordon Huang
//

import Foundation

struct NudgeTask: Identifiable, Codable {
    var id = UUID()
    var title: String
    var description: String?
    var startTime: Date
    var endTime: Date
    var isCompleted: Bool = false
    var priority: Priority = .medium

    enum Priority: String, Codable {
        case low, medium, high
    }
}