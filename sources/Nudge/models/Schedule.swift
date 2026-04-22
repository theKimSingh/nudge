//
//  Schedule.swift
//  Nudge
//
//  Created by Gordon Huang
//

import Foundation

struct Schedule: Identifiable, Codable {
    var id = UUID()
    var date: Date
    var tasks: [NudgeTask]
}